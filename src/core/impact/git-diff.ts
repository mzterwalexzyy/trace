import { execSync } from 'child_process';
import { HydraDBClient } from '../hydradb/client.js';
import { GraphNode } from '../hydradb/types.js';

export interface ChangedSymbolInfo {
  filePath: string;
  symbol: GraphNode;
  changedLines: number[];
}

export class GitDiffEngine {
  private dbClient: HydraDBClient;
  private repoPath: string;

  constructor(dbClient: HydraDBClient, repoPath: string = process.cwd()) {
    this.dbClient = dbClient;
    this.repoPath = repoPath;
  }

  public detectChangedSymbols(): ChangedSymbolInfo[] {
    const changedFilesAndLines = this.getGitDiffChangedLines();
    const results: ChangedSymbolInfo[] = [];

    for (const item of changedFilesAndLines) {
      // Normalize filePath
      const normalizedPath = item.filePath.replace(/\\/g, '/');

      // Find static nodes in HydraDB belonging to this file
      const fileNodes = this.dbClient.findNodes((n) => {
        if (n.type !== 'Function' && n.type !== 'Method' && n.type !== 'Class') return false;
        return Boolean(n.filePath === normalizedPath || (n.filePath && n.filePath.endsWith(normalizedPath)));
      });

      for (const line of item.lines) {
        for (const node of fileNodes) {
          if (node.startLine && node.endLine && line >= node.startLine && line <= node.endLine) {
            if (!results.some((r) => r.symbol.id === node.id)) {
              results.push({
                filePath: normalizedPath,
                symbol: node,
                changedLines: item.lines,
              });
            }
          }
        }
      }
    }

    return results;
  }

  private getGitDiffChangedLines(): { filePath: string; lines: number[] }[] {
    try {
      // Run git diff for unstaged and staged changes
      const diffOutput = execSync('git diff HEAD -U0', { cwd: this.repoPath, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      return this.parseGitDiffOutput(diffOutput);
    } catch {
      try {
        // Fallback to git diff working tree
        const diffOutput = execSync('git diff -U0', { cwd: this.repoPath, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        return this.parseGitDiffOutput(diffOutput);
      } catch {
        return [];
      }
    }
  }

  private parseGitDiffOutput(diffText: string): { filePath: string; lines: number[] }[] {
    const results: { filePath: string; lines: number[] }[] = [];
    const fileChunks = diffText.split(/^diff --git /m);

    for (const chunk of fileChunks) {
      if (!chunk.trim()) continue;

      const fileMatch = chunk.match(/b\/(.+)$/m);
      if (!fileMatch) continue;

      const filePath = fileMatch[1].trim();
      const hunkHeaders = chunk.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm);
      const changedLines: number[] = [];

      for (const match of hunkHeaders) {
        const startLine = parseInt(match[1], 10);
        const count = match[2] !== undefined ? parseInt(match[2], 10) : 1;

        for (let i = 0; i < Math.max(1, count); i++) {
          changedLines.push(startLine + i);
        }
      }

      if (changedLines.length > 0) {
        results.push({ filePath, lines: changedLines });
      }
    }

    return results;
  }
}
