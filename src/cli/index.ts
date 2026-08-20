#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'path';
import { execSync, spawn } from 'child_process';
import { HydraDBClient } from '../core/hydradb/client.js';
import { RepositoryAnalyzer } from '../core/parser/analyzer.js';
import { IntersectionEngine } from '../core/impact/intersection.js';
import { GitDiffEngine } from '../core/impact/git-diff.js';
import { formatTextImpactReport } from '../core/reporter/text-reporter.js';

const program = new Command();
const dbClient = new HydraDBClient();

program
  .name('trace')
  .description('TRACE — Engineering Intelligence Platform powered by HydraDB')
  .version('1.0.0');

// Command 1: trace analyze [repoPath]
program
  .command('analyze')
  .description('Parse codebase AST and write static dependency graph')
  .argument('[repoPath]', 'Path to target repository', '.')
  .action(async (repoPathArg: string) => {
    const targetDir = path.resolve(repoPathArg);
    const info = dbClient.getStorageModeInfo();
    console.log(`\n🔍 TRACE: Analyzing repository at ${targetDir}...`);
    console.log(`ℹ️  Storage Mode: ${info.mode} [${info.sdkPackage}]`);

    const analyzer = new RepositoryAnalyzer({ repoPath: targetDir }, dbClient);
    const result = analyzer.analyze();

    // Ingest per-symbol context (functions, methods, endpoints) into HydraDB.
    const commitSha = dbClient.getSnapshotId();
    const symbols = dbClient
      .findNodes((n) => n.type === 'Function' || n.type === 'Method' || n.type === 'APIEndpoint')
      .slice(0, 60);
    const items = symbols.map((node) => {
      const callers = dbClient.getInboundEdges(node.id).map((e) => dbClient.getNode(e.from)?.name).filter(Boolean);
      const callees = dbClient.getOutboundEdges(node.id).map((e) => dbClient.getNode(e.to)?.name).filter(Boolean);
      const location = node.filePath ? `${node.filePath}${node.startLine ? `:${node.startLine}` : ''}` : 'unknown';
      return {
        content:
          `${node.type} ${node.name} defined in ${location}. ` +
          (callers.length ? `Called by: ${callers.join(', ')}. ` : '') +
          (callees.length ? `Calls / exposes: ${callees.join(', ')}. ` : ''),
        metadata: { symbol: node.name, symbolType: node.type, filePath: node.filePath || '', commitSha, repository: path.basename(targetDir) },
      };
    });
    const ingest = await dbClient.ingestContextBatch(items);

    console.log(`✅ Static graph saved (${result.nodeCount} nodes, ${result.edgeCount} edges).`);
    console.log(`   Ingested ${ingest.ingested} symbol context docs into HydraDB (${ingest.mode}).`);
    console.log(`   Snapshot ID: ${commitSha}\n`);
  });

// Command 2: trace impact <symbol>
program
  .command('impact')
  .description('Calculate blast radius & static/runtime intersection for a target symbol')
  .argument('<symbol>', 'Function, class, or symbol name')
  .option('-d, --depth <number>', 'Traversal depth', '6')
  .action(async (symbol: string, options: { depth: string }) => {
    const depth = parseInt(options.depth, 10);
    try {
      const intersectionEngine = new IntersectionEngine(dbClient);
      const report = await intersectionEngine.generateReportAsync(symbol, depth);
      console.log('\n' + formatTextImpactReport(report));
    } catch (err: any) {
      console.error(`❌ Impact analysis error: ${err.message}`);
      process.exit(1);
    }
  });

// Command 3: trace diff
program
  .command('diff')
  .description('Detect changed symbols via git diff and calculate change impact')
  .action(async () => {
    const info = dbClient.getStorageModeInfo();
    console.log(`\n Git Diff: Detecting modified symbols in working tree...`);
    console.log(`ℹ️  Storage Mode: ${info.mode}`);

    const gitEngine = new GitDiffEngine(dbClient);
    const changedSymbols = gitEngine.detectChangedSymbols();

    if (changedSymbols.length === 0) {
      console.log(`ℹ️  No modified symbols matched in current graph.`);
      return;
    }

    console.log(`🎯 Found ${changedSymbols.length} modified symbol(s):`);
    for (const item of changedSymbols) {
      console.log(`   • ${item.symbol.name} (${item.filePath})`);
    }

    const intersectionEngine = new IntersectionEngine(dbClient);
    for (const item of changedSymbols) {
      const report = await intersectionEngine.generateReportAsync(item.symbol.id);
      console.log('\n' + formatTextImpactReport(report));
    }
  });

// Command 4: trace traces
program
  .command('traces')
  .description('List captured runtime execution traces')
  .action(() => {
    const traces = dbClient.getExecutionTraces();
    console.log(`\n⚡ Recorded Execution Traces (${traces.length} total):\n`);
    if (traces.length === 0) {
      console.log('   (No execution traces captured yet. Run `trace run <command>`).');
      return;
    }

    for (const t of traces) {
      const spans = dbClient.getExecutionSpansForTrace(t.id);
      console.log(`• [${t.id}] ${t.name} (${spans.length} spans recorded at ${t.metadata?.startTime || 'recent'})`);
      for (const span of spans.slice(0, 5)) {
        if (span.type === 'ExecutionSpan') {
          console.log(`    └─► ${span.name} [${span.metadata?.duration || 0}ms]`);
        }
      }
    }
    console.log('');
  });

// Command 5: trace run <cmd...>
program
  .command('run')
  .description('Execute application/tests with TRACE runtime instrumentation enabled')
  .argument('<cmd...>', 'Command to run')
  .action((cmdParts: string[]) => {
    const commandStr = cmdParts.join(' ');
    console.log(`\n⚡ TRACE: Instrumenting runtime execution for command: '${commandStr}'...`);
    try {
      execSync(commandStr, {
        stdio: 'inherit',
        env: {
          ...process.env,
          TRACE_INSTRUMENT: 'true',
        },
      });
      console.log(`\n✅ Command finished. Runtime traces stored in graph.`);
    } catch (err: any) {
      console.error(`⚠️ Command exited with error: ${err.message}`);
    }
  });

// Command 6: trace hydra status / ingest / query
const hydraCmd = program.command('hydra').description('HydraDB cloud storage & recall management');

hydraCmd
  .command('status')
  .description('Check HydraDB driver mode and connection status')
  .action(() => {
    const info = dbClient.getStorageModeInfo();
    console.log('\nHydraDB Driver Status');
    console.log('──────────────────────────────────────────────────');
    console.log(`Mode:        ${info.mode}`);
    console.log(`SDK Package: ${info.sdkPackage}`);
    console.log(`Status:      ${info.isConnected ? '✓ Connected / Active' : '⚠ Local Mode'}`);
    console.log(`Database:    ${info.database}`);
    console.log('');
  });

hydraCmd
  .command('ingest')
  .description('Ingest context payload into HydraDB')
  .argument('<text>', 'Context text content')
  .action(async (text: string) => {
    console.log(`\n📤 Ingesting context into HydraDB...`);
    const res = await dbClient.ingestContext({
      content: text,
      metadata: { symbol: 'CLI_Ingest', timestamp: new Date().toISOString() },
    });
    console.log(`✅ Ingested successfully (Source ID: ${res.sourceId}, Status: ${res.status}).\n`);
  });

hydraCmd
  .command('query')
  .description('Query context from HydraDB')
  .argument('<queryStr>', 'Search query string')
  .action(async (queryStr: string) => {
    console.log(`\n🔍 Querying HydraDB context for: "${queryStr}"...`);
    const results = await dbClient.queryContext(queryStr, { maxResults: 5 });
    console.log(`\n Found ${results.length} result(s):\n`);
    for (const r of results) {
      console.log(`• [Score: ${r.score.toFixed(2)}] ${r.content}`);
    }
    console.log('');
  });

// Command 7: trace ui
program
  .command('ui')
  .description('Launch the TRACE Developer Web Dashboard')
  .option('-p, --port <number>', 'Port number', '3000')
  .action((options: { port: string }) => {
    const port = options.port;
    console.log(`\n🚀 Launching TRACE Web Dashboard at http://localhost:${port}...`);
    const child = spawn('npx', ['tsx', 'src/server/api-server.ts'], {
      stdio: 'inherit',
      env: { ...process.env, PORT: port },
    });

    child.on('error', (err) => {
      console.error(`Failed to launch server: ${err.message}`);
    });
  });

program.parse(process.argv);
