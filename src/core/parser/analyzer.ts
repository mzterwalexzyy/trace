import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import { HydraDBClient } from '../hydradb/client.js';

export interface RepositoryAnalyzerOptions {
  repoPath: string;
  commitSha?: string;
  snapshotId?: string;
}

export class RepositoryAnalyzer {
  private repoPath: string;
  private dbClient: HydraDBClient;
  private commitSha: string;
  private snapshotId: string;

  constructor(options: RepositoryAnalyzerOptions, dbClient: HydraDBClient) {
    this.repoPath = path.resolve(options.repoPath);
    this.dbClient = dbClient;
    this.commitSha = options.commitSha || this.getGitCommitSha() || 'HEAD';
    this.snapshotId = options.snapshotId || `snap_${Date.now()}`;
  }

  private getGitCommitSha(): string | null {
    try {
      const gitHeadPath = path.join(this.repoPath, '.git', 'HEAD');
      if (fs.existsSync(gitHeadPath)) {
        const headContent = fs.readFileSync(gitHeadPath, 'utf-8').trim();
        if (headContent.startsWith('ref:')) {
          const refPath = path.join(this.repoPath, '.git', headContent.substring(5).trim());
          if (fs.existsSync(refPath)) {
            return fs.readFileSync(refPath, 'utf-8').trim().substring(0, 7);
          }
        } else {
          return headContent.substring(0, 7);
        }
      }
    } catch {
      // Ignore
    }
    return null;
  }

  public analyze(): { nodeCount: number; edgeCount: number } {
    // A snapshot represents exactly one repository. Reset any prior graph so
    // re-analyzing (or switching repositories) yields a deterministic result
    // rather than accumulating stale nodes from previous runs.
    this.dbClient.clear();
    this.dbClient.setSnapshotMetadata(this.commitSha, this.snapshotId);

    const repoName = path.basename(this.repoPath);
    const repoNodeId = `repo_${repoName}`;
    this.dbClient.upsertNode({
      id: repoNodeId,
      type: 'Repository',
      name: repoName,
      filePath: this.repoPath,
      commitSha: this.commitSha,
      snapshotId: this.snapshotId,
    });

    const files = this.collectSourceFiles(this.repoPath);
    const parsedFiles: { filePath: string; relativePath: string; fileNodeId: string; sourceFile: ts.SourceFile; isTestFile: boolean }[] = [];

    // PASS 1: Create File and Symbol Nodes across all files
    for (const filePath of files) {
      const relativePath = path.relative(this.repoPath, filePath).replace(/\\/g, '/');
      const fileNodeId = `file_${relativePath}`;
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const isTestFile = /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(filePath) || relativePath.includes('/tests/');

      this.dbClient.upsertNode({
        id: fileNodeId,
        type: 'File',
        name: relativePath,
        filePath: relativePath,
        commitSha: this.commitSha,
        snapshotId: this.snapshotId,
        metadata: { isTestFile },
      });

      this.dbClient.addEdge({
        from: repoNodeId,
        to: fileNodeId,
        type: 'CONTAINS',
      });

      const sourceFile = ts.createSourceFile(
        filePath,
        fileContent,
        ts.ScriptTarget.Latest,
        true,
        filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      );

      parsedFiles.push({ filePath, relativePath, fileNodeId, sourceFile, isTestFile });

      const visitPass1 = (node: ts.Node) => {
        if (ts.isImportDeclaration(node)) {
          const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
          const importNodeId = `import_${relativePath}_${moduleSpecifier}`;
          this.dbClient.upsertNode({
            id: importNodeId,
            type: 'Module',
            name: moduleSpecifier,
            filePath: relativePath,
            commitSha: this.commitSha,
            snapshotId: this.snapshotId,
          });
          this.dbClient.addEdge({
            from: fileNodeId,
            to: importNodeId,
            type: 'IMPORTS',
          });
        }

        if (ts.isFunctionDeclaration(node) && node.name) {
          const fnName = node.name.text;
          const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
          const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
          const fnNodeId = `fn_${relativePath}_${fnName}`;

          this.dbClient.upsertNode({
            id: fnNodeId,
            type: 'Function',
            name: fnName,
            filePath: relativePath,
            startLine,
            endLine,
            commitSha: this.commitSha,
            snapshotId: this.snapshotId,
            metadata: { isTest: isTestFile },
          });

          this.dbClient.addEdge({
            from: fileNodeId,
            to: fnNodeId,
            type: 'CONTAINS',
          });
        }

        if (ts.isVariableStatement(node)) {
          for (const decl of node.declarationList.declarations) {
            if (ts.isIdentifier(decl.name) && decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
              const fnName = decl.name.text;
              const startLine = sourceFile.getLineAndCharacterOfPosition(decl.getStart(sourceFile)).line + 1;
              const endLine = sourceFile.getLineAndCharacterOfPosition(decl.getEnd()).line + 1;
              const fnNodeId = `fn_${relativePath}_${fnName}`;

              this.dbClient.upsertNode({
                id: fnNodeId,
                type: 'Function',
                name: fnName,
                filePath: relativePath,
                startLine,
                endLine,
                commitSha: this.commitSha,
                snapshotId: this.snapshotId,
                metadata: { isTest: isTestFile },
              });

              this.dbClient.addEdge({
                from: fileNodeId,
                to: fnNodeId,
                type: 'CONTAINS',
              });
            }
          }
        }

        if (ts.isClassDeclaration(node) && node.name) {
          const className = node.name.text;
          const classNodeId = `class_${relativePath}_${className}`;
          this.dbClient.upsertNode({
            id: classNodeId,
            type: 'Class',
            name: className,
            filePath: relativePath,
            commitSha: this.commitSha,
            snapshotId: this.snapshotId,
          });
          this.dbClient.addEdge({
            from: fileNodeId,
            to: classNodeId,
            type: 'CONTAINS',
          });
        }

        ts.forEachChild(node, visitPass1);
      };

      visitPass1(sourceFile);
    }

    // PASS 2: Connect Calls, API Endpoints, DB Queries, and Test Edges
    for (const pf of parsedFiles) {
      const { relativePath, fileNodeId, sourceFile, isTestFile } = pf;

      const visitPass2 = (node: ts.Node, currentSymbolId?: string) => {
        let activeSymbolId = currentSymbolId;
        if (ts.isFunctionDeclaration(node) && node.name) {
          activeSymbolId = `fn_${relativePath}_${node.name.text}`;
        } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
          activeSymbolId = `fn_${relativePath}_${node.name.text}`;
        }

        // Express / Router API Endpoint detection
        if (ts.isCallExpression(node)) {
          const exprText = node.expression.getText(sourceFile);
          const matchRoute = exprText.match(/^(app|router)\.(get|post|put|delete|patch)$/i);
          if (matchRoute && node.arguments.length >= 2) {
            const method = matchRoute[2].toUpperCase();
            const firstArg = node.arguments[0];
            if (ts.isStringLiteral(firstArg)) {
              const routePath = firstArg.text;
              const endpointName = `${method} ${routePath}`;
              const endpointNodeId = `endpoint_${method}_${routePath.replace(/\//g, '_')}`;

              this.dbClient.upsertNode({
                id: endpointNodeId,
                type: 'APIEndpoint',
                name: endpointName,
                filePath: relativePath,
                commitSha: this.commitSha,
                snapshotId: this.snapshotId,
                metadata: { method, path: routePath },
              });

              this.dbClient.addEdge({
                from: fileNodeId,
                to: endpointNodeId,
                type: 'EXPOSES',
              });

              const handlerArg = node.arguments[node.arguments.length - 1];
              const handlerNames: string[] = [];

              if (ts.isIdentifier(handlerArg)) {
                handlerNames.push(handlerArg.text);
              } else if (ts.isFunctionExpression(handlerArg) || ts.isArrowFunction(handlerArg)) {
                const findCallInInline = (child: ts.Node) => {
                  if (ts.isCallExpression(child)) {
                    let fnName = '';
                    if (ts.isIdentifier(child.expression)) {
                      fnName = child.expression.text;
                    } else if (ts.isPropertyAccessExpression(child.expression)) {
                      fnName = child.expression.name.text;
                    }

                    if (fnName && !['json', 'send', 'status', 'parseFloat', 'parseInt'].includes(fnName)) {
                      handlerNames.push(fnName);
                    }
                  }
                  ts.forEachChild(child, findCallInInline);
                };
                findCallInInline(handlerArg);
              }

              for (const hName of handlerNames) {
                const targetHandlerNodes = this.dbClient.findNodes((n) => n.name === hName && (n.type === 'Function' || n.type === 'Method'));
                for (const targetHandlerNode of targetHandlerNodes) {
                  this.dbClient.addEdge({
                    from: endpointNodeId,
                    to: targetHandlerNode.id,
                    type: 'EXPOSES',
                  });
                }
              }
            }
          }

          // Database Operations.
          // Heuristic detection of DB access. The callee-length guard rejects
          // false positives such as inline IIFEs whose text merely happens to
          // contain "query"/"Database" — real DB calls have short callees
          // (e.g. `db.query`, `createOrderInDatabase`). querySelector is excluded.
          const dbHit =
            exprText.includes('db.') ||
            exprText.includes('prisma.') ||
            exprText.includes('knex') ||
            exprText.includes('Database') ||
            (exprText.includes('query') && !exprText.toLowerCase().includes('queryselector'));
          if (dbHit && exprText.length <= 50) {
            const dbNodeId = `db_operation_${relativePath}_${node.getStart(sourceFile)}`;
            const queryText = node.arguments.map((a) => a.getText(sourceFile)).join(' ');

            this.dbClient.upsertNode({
              id: dbNodeId,
              type: 'DBSchema',
              name: `DB:${exprText.slice(0, 40)}`,
              filePath: relativePath,
              commitSha: this.commitSha,
              snapshotId: this.snapshotId,
              metadata: { query: queryText.substring(0, 100) },
            });

            if (activeSymbolId) {
              this.dbClient.addEdge({
                from: activeSymbolId,
                to: dbNodeId,
                type: queryText.toUpperCase().includes('INSERT') || queryText.toUpperCase().includes('UPDATE') ? 'WRITES_SCHEMA' : 'READS_SCHEMA',
              });
            }
          }

          // Function Calls
          if (activeSymbolId) {
            let calledName = '';
            if (ts.isIdentifier(node.expression)) {
              calledName = node.expression.text;
            } else if (ts.isPropertyAccessExpression(node.expression)) {
              calledName = node.expression.name.text;
            }

            if (calledName && !['log', 'json', 'status', 'use', 'listen', 'post', 'get', 'test', 'describe', 'it', 'strictEqual', 'ok', 'traced', 'setTraceImpl'].includes(calledName)) {
              const targetNodes = this.dbClient.findNodesByNameOrSymbol(calledName);
              const targetNode = targetNodes.find((n) => n.id !== activeSymbolId);

              if (targetNode) {
                if (isTestFile) {
                  this.dbClient.addEdge({
                    from: activeSymbolId,
                    to: targetNode.id,
                    type: 'TESTED_BY',
                  });
                } else {
                  this.dbClient.addEdge({
                    from: activeSymbolId,
                    to: targetNode.id,
                    type: 'CALLS',
                  });
                }
              }
            }
          }
        }

        ts.forEachChild(node, (child) => visitPass2(child, activeSymbolId));
      };

      visitPass2(sourceFile);
    }

    this.dbClient.saveState();

    return {
      nodeCount: this.dbClient.getNodes().length,
      edgeCount: this.dbClient.getEdges().length,
    };
  }

  // Hard bounds so analyzing a very large (or accidentally broad) directory can
  // never recurse without limit or exhaust memory. TRACE targets application
  // repositories, not entire drives.
  private static readonly MAX_FILES = 5000;
  private static readonly MAX_DEPTH = 25;
  private static readonly IGNORED_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', '.trace', 'coverage', '.next', 'out', '.cache',
    'vendor', '.turbo', 'tmp', 'temp',
    // Framework build output (minified bundles, not source):
    '.output', '_nuxt', '.nuxt', '.svelte-kit', '.vercel', '.netlify', '.astro',
  ]);

  // Heuristic: skip minified/generated bundles even when they slip past dir filters.
  private isMinified(name: string, fullPath: string): boolean {
    if (/\.min\.(js|jsx)$/.test(name) || /\.bundle\.js$/.test(name)) return true;
    try {
      const stat = fs.statSync(fullPath);
      if (stat.size > 400 * 1024) {
        // Large single-line files are almost always minified/generated.
        const head = fs.readFileSync(fullPath, 'utf-8').slice(0, 60000);
        const newlines = (head.match(/\n/g) || []).length;
        if (newlines < 5) return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  private collectSourceFiles(dir: string, depth = 0, results: string[] = []): string[] {
    if (depth > RepositoryAnalyzer.MAX_DEPTH || results.length >= RepositoryAnalyzer.MAX_FILES) {
      return results;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // Unreadable directory (permissions, broken symlink) — skip rather than fail the whole analysis.
      return results;
    }

    // TypeScript basenames in this directory, so a compiled `foo.js` sitting next
    // to its `foo.ts` source is treated as build output and skipped — otherwise
    // the same symbols get parsed twice and every count doubles.
    const tsBasenames = new Set<string>();
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const m = entry.name.match(/^(.*)\.(ts|tsx)$/);
      if (m && !entry.name.endsWith('.d.ts')) tsBasenames.add(m[1]);
    }

    for (const entry of entries) {
      if (results.length >= RepositoryAnalyzer.MAX_FILES) break;
      // Never follow symlinks: prevents cycles and escaping the repository root.
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip dependency, VCS, cache, and BUILD-OUTPUT directories. Build output
        // (Nuxt/Next/SvelteKit/etc.) contains minified bundles whose one-letter
        // symbols ("h", "z", "_") are noise, not real source.
        if (!RepositoryAnalyzer.IGNORED_DIRS.has(entry.name)) {
          this.collectSourceFiles(fullPath, depth + 1, results);
        }
      } else if (entry.isFile()) {
        if (/\.(ts|js|tsx|jsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts') && !this.isMinified(entry.name, fullPath)) {
          // Drop compiled JS that shadows a TS source in the same directory.
          const js = entry.name.match(/^(.*)\.(js|jsx)$/);
          if (js && tsBasenames.has(js[1])) continue;
          results.push(fullPath);
        }
      }
    }
    return results;
  }
}
