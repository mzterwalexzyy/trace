import express from 'express';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as tar from 'tar';
import { execFile } from 'child_process';
import { HydraDBClient } from '../core/hydradb/client.js';
import { RepositoryAnalyzer } from '../core/parser/analyzer.js';
import { IntersectionEngine } from '../core/impact/intersection.js';
import { GitDiffEngine } from '../core/impact/git-diff.js';
import { runDemoScenario, DEMO_SCENARIOS, DemoScenario } from './demo-runner.js';
import { supabaseStore } from './supabase-store.js';
import { answerQuestion } from './ask.js';
import { aiProviderInfo } from './ai-provider.js';

const app = express();
const port = Number(process.env.PORT) || 3000;

// On serverless (Vercel) the project dir is read-only — only the OS temp dir is
// writable. Persist the local graph, eval log, and clones there. Locally this
// stays the project dir so state survives restarts.
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_ROOT = IS_SERVERLESS ? path.join(os.tmpdir(), 'trace') : process.cwd();
const dbClient = new HydraDBClient({ dbPath: path.join(DATA_ROOT, '.trace', 'hydradb_graph.json') });
const intersectionEngine = new IntersectionEngine(dbClient);
const gitDiffEngine = new GitDiffEngine(dbClient);

let activeRepoPath = path.resolve(process.cwd());

// ---------------------------------------------------------------------------
// Git repository cloning
//
// Analyze accepts a Git URL as well as a local path. URLs are cloned (shallow,
// single-branch) into a managed cache under .trace/repos and then analyzed like
// any local repo. execFile (no shell) + a strict URL check prevent command
// injection; GIT_TERMINAL_PROMPT=0 avoids hanging on auth prompts.
// ---------------------------------------------------------------------------
const GIT_URL_RE = /^(https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+|git@[A-Za-z0-9._-]+:[A-Za-z0-9._/-]+)$/;

function isGitUrl(s: string): boolean {
  return GIT_URL_RE.test(s.trim());
}

function repoNameFromUrl(url: string): string {
  const base = url.trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  const m = base.match(/([^/:]+)$/);
  const raw = m ? m[1] : 'repo';
  return raw.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 60) || 'repo';
}

function gitCloneBinary(clean: string, dest: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    } catch (err: any) {
      reject(new Error(`Could not prepare clone directory: ${err.message}`));
      return;
    }
    execFile(
      'git',
      ['clone', '--depth', '1', '--single-branch', '--', clean, dest],
      { timeout: 120000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '' } },
      (err) => {
        if (err) {
          try { if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true }); } catch { /* ignore */ }
          reject(new Error(err.killed ? 'Clone timed out.' : `git clone failed (check the URL and that the repo is public): ${err.message}`));
          return;
        }
        resolve(dest);
      }
    );
  });
}

/**
 * Fetch a public GitHub repo as a tarball and extract it — no `git` binary
 * required, so this works on serverless hosts (Vercel) where git is absent.
 * Falls back to the git binary for non-GitHub URLs or when the tarball fails.
 */
async function cloneRepo(url: string): Promise<string> {
  const clean = url.trim();
  if (!isGitUrl(clean)) throw new Error('Not a valid Git URL.');

  const dest = path.resolve(DATA_ROOT, '.trace', 'repos', repoNameFromUrl(clean));
  // Reuse an existing non-empty clone.
  try {
    if (fs.existsSync(dest) && fs.readdirSync(dest).some((f) => f !== '_src.tar.gz')) return dest;
  } catch { /* fall through */ }

  const gh = clean.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
  if (gh) {
    const [, owner, repo] = gh;
    fs.mkdirSync(dest, { recursive: true });
    // GitHub's tarball endpoint redirects to the default branch archive.
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/tarball`, {
      headers: { 'User-Agent': 'trace-app', Accept: 'application/vnd.github+json' },
      redirect: 'follow',
    });
    if (res.ok && res.body) {
      const tmpTar = path.join(dest, '_src.tar.gz');
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(tmpTar, buf);
      // strip:1 drops GitHub's top-level "<owner>-<repo>-<sha>/" wrapper dir.
      await tar.x({ file: tmpTar, cwd: dest, strip: 1 });
      try { fs.rmSync(tmpTar, { force: true }); } catch { /* ignore */ }
      return dest;
    }
    if (res.status === 404) throw new Error('Repository not found (is it public?).');
    if (res.status === 403) throw new Error('GitHub rate limit reached — try again shortly.');
    // Non-OK but not a clear error → try git as a fallback.
  }

  // Non-GitHub URL, or tarball unavailable: use the git binary (local dev).
  return gitCloneBinary(clean, dest);
}

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Serverless active-graph rehydration
//
// On stateless hosts (Vercel) the in-memory graph does not survive between
// function invocations. After each analysis we mirror the whole graph to a
// shared Supabase blob; on a cold request with an empty graph we reload it, so
// analyze → impact/ask/graph stay consistent across separate invocations.
// On a normal long-running server this is a no-op (graph is already in memory).
// ---------------------------------------------------------------------------
async function saveActiveGraphNow(): Promise<void> {
  if (!IS_SERVERLESS || !supabaseStore.isConfigured()) return;
  try {
    const nodes = dbClient.getNodes();
    const payload = JSON.stringify({
      nodes,
      edges: dbClient.getEdges(),
      snapshotId: dbClient.getSnapshotId(),
      commitSha: (nodes.find((n) => n.type === 'Repository')?.commitSha as string) || 'HEAD',
      activeRepoPath,
    });
    await supabaseStore.saveActiveGraph(payload);
  } catch (err: any) {
    console.warn(`[active-graph] save failed: ${err.message}`);
  }
}

async function ensureGraphLoaded(): Promise<void> {
  if (!IS_SERVERLESS || !supabaseStore.isConfigured()) return;
  if (dbClient.getNodes().length > 0) return; // already hydrated in this instance
  try {
    const json = await supabaseStore.loadActiveGraph();
    if (!json) return;
    const g = JSON.parse(json);
    dbClient.clear();
    dbClient.setSnapshotMetadata(g.commitSha || 'HEAD', g.snapshotId || `snap_${Date.now()}`);
    for (const n of g.nodes || []) dbClient.upsertNode(n);
    for (const e of g.edges || []) dbClient.addEdge(e);
    if (g.activeRepoPath) activeRepoPath = g.activeRepoPath;
  } catch (err: any) {
    console.warn(`[active-graph] load failed: ${err.message}`);
  }
}

// Rehydrate the graph on cold serverless requests before any handler runs.
app.use(async (_req, _res, next) => {
  try {
    await ensureGraphLoaded();
  } catch {
    /* non-fatal */
  }
  next();
});

// ---------------------------------------------------------------------------
// Evaluation-run log
//
// Every repository analysis appends a real summary record here so the Dashboard
// can show genuine history and aggregates (repos evaluated, symbols, endpoints)
// rather than fabricated numbers. Persisted to .trace so it survives restarts.
// ---------------------------------------------------------------------------
interface EvaluationRun {
  id: string;
  repoName: string;
  repoPath: string;
  branch: string;
  commitSha: string;
  snapshotId: string;
  status: 'Completed';
  startedAt: string;
  files: number;
  functions: number;
  endpoints: number;
  dbSchemas: number;
  tests: number;
  nodeCount: number;
  edgeCount: number;
}

const EVAL_LOG_PATH = path.resolve(DATA_ROOT, '.trace', 'evaluations.json');

function loadRuns(): EvaluationRun[] {
  try {
    return JSON.parse(fs.readFileSync(EVAL_LOG_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function recordRun(run: EvaluationRun): void {
  const runs = loadRuns();
  runs.unshift(run); // newest first
  const capped = runs.slice(0, 40);
  try {
    fs.mkdirSync(path.dirname(EVAL_LOG_PATH), { recursive: true });
    fs.writeFileSync(EVAL_LOG_PATH, JSON.stringify(capped, null, 2));
  } catch (err: any) {
    console.warn(`Failed to persist evaluation run: ${err.message}`);
  }
}

/**
 * Build one context document per code symbol (functions, methods, endpoints)
 * describing its file, location, callers and callees, and ingest them into
 * HydraDB as searchable knowledge. Capped to keep ingestion bounded on large
 * repositories.
 */
async function ingestSymbolContext(repository: string, commitSha: string): Promise<void> {
  const MAX_DOCS = 60;
  const symbols = dbClient
    .findNodes((n) => n.type === 'Function' || n.type === 'Method' || n.type === 'APIEndpoint')
    .slice(0, MAX_DOCS);

  const items = symbols.map((node) => {
    const callers = dbClient
      .getInboundEdges(node.id)
      .map((e) => dbClient.getNode(e.from)?.name)
      .filter(Boolean);
    const callees = dbClient
      .getOutboundEdges(node.id)
      .map((e) => dbClient.getNode(e.to)?.name)
      .filter(Boolean);
    const location = node.filePath ? `${node.filePath}${node.startLine ? `:${node.startLine}` : ''}` : 'unknown';
    const content =
      `${node.type} ${node.name} defined in ${location}. ` +
      (callers.length ? `Called by: ${callers.join(', ')}. ` : '') +
      (callees.length ? `Calls / exposes: ${callees.join(', ')}. ` : '');
    return {
      content,
      metadata: {
        symbol: node.name,
        symbolType: node.type,
        filePath: node.filePath || '',
        commitSha,
        repository,
      },
    };
  });

  if (items.length > 0) {
    await dbClient.ingestContextBatch(items);
  }
}

// API 1: Repository Status
app.get('/api/repository', (req, res) => {
  const nodes = dbClient.getNodes();
  res.json({
    repoPath: activeRepoPath,
    repoName: path.basename(activeRepoPath),
    analyzed: nodes.length > 0,
    nodeCount: nodes.length,
    edgeCount: dbClient.getEdges().length,
    snapshotId: dbClient.getSnapshotId(),
    storageMode: dbClient.getStorageModeInfo(),
  });
});

// API 2: Repository Analysis
app.post('/api/repository/analyze', async (req, res) => {
  try {
    const { repoPath, useDemo } = req.body;
    let targetDir = activeRepoPath;

    if (useDemo || repoPath === 'demo' || repoPath === 'demo-app') {
      targetDir = path.resolve(process.cwd(), 'demo-app');
    } else if (repoPath && typeof repoPath === 'string') {
      const cleanPath = repoPath.trim().replace(/^["']|["']$/g, '');
      if (isGitUrl(cleanPath)) {
        try {
          targetDir = await cloneRepo(cleanPath);
        } catch (err: any) {
          return res.status(400).json({ error: err.message });
        }
      } else {
        targetDir = path.resolve(cleanPath);
      }
    }

    if (!fs.existsSync(targetDir)) {
      return res.status(400).json({ error: `Repository path does not exist: ${targetDir}` });
    }

    const stat = fs.statSync(targetDir);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: `Target path is not a directory: ${targetDir}` });
    }

    activeRepoPath = targetDir;
    const analyzer = new RepositoryAnalyzer({ repoPath: targetDir }, dbClient);
    const result = analyzer.analyze();

    // Ingest per-symbol context into HydraDB in the background (non-blocking).
    // Each function/endpoint becomes a searchable knowledge document scoped by
    // symbol/file/commit, so later impact reports can retrieve real context.
    void ingestSymbolContext(path.basename(targetDir), dbClient.getSnapshotId()).catch((err) =>
      console.warn(`HydraDB async ingest warning: ${err.message}`)
    );

    const nodes = dbClient.getNodes();
    const functionsCount = nodes.filter((n) => n.type === 'Function' || n.type === 'Method').length;
    const endpointsCount = nodes.filter((n) => n.type === 'APIEndpoint').length;
    const dbSchemasCount = nodes.filter((n) => n.type === 'DBSchema').length;
    const testsCount = nodes.filter((n) => Boolean(n.metadata?.isTest)).length;
    const filesCount = nodes.filter((n) => n.type === 'File').length;

    // Record this analysis as a real evaluation run for the Dashboard.
    recordRun({
      id: `run_${Date.now()}`,
      repoName: path.basename(targetDir),
      repoPath: targetDir,
      branch: nodes.find((n) => n.type === 'Repository')?.metadata?.branch || 'main',
      commitSha: (dbClient.getNodes().find((n) => n.type === 'Repository')?.commitSha as string) || 'HEAD',
      snapshotId: dbClient.getSnapshotId(),
      status: 'Completed',
      startedAt: new Date().toISOString(),
      files: filesCount,
      functions: functionsCount,
      endpoints: endpointsCount,
      dbSchemas: dbSchemasCount,
      tests: testsCount,
      nodeCount: result.nodeCount,
      edgeCount: result.edgeCount,
    });

    // Cloud persistence: when Supabase is configured AND the request carries a
    // signed-in user's token, mirror this analysis (repo + run + graph blob) to
    // Supabase for that user. Fully non-blocking and best-effort — a failure
    // never affects the local-first response.
    if (supabaseStore.isConfigured()) {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || undefined;
      void supabaseStore.getUserId(token).then(async (owner) => {
        if (!owner) return;
        const repoName = path.basename(targetDir);
        const isGit = typeof repoPath === 'string' && isGitUrl(repoPath.trim());
        const repositoryId = await supabaseStore.upsertRepository(owner, {
          name: repoName,
          source: isGit ? 'git' : 'local',
          gitUrl: isGit ? repoPath.trim() : undefined,
          localPath: isGit ? undefined : targetDir,
          branch: 'main',
        });
        if (!repositoryId) return;
        const snapshotId = dbClient.getSnapshotId();
        await supabaseStore.recordRun(owner, repositoryId, {
          snapshotId,
          branch: 'main',
          commitSha: (dbClient.getNodes().find((n) => n.type === 'Repository')?.commitSha as string) || 'HEAD',
          files: filesCount,
          functions: functionsCount,
          endpoints: endpointsCount,
          dbSchemas: dbSchemasCount,
          tests: testsCount,
          nodeCount: result.nodeCount,
          edgeCount: result.edgeCount,
        });
        await supabaseStore.saveGraph(owner, repositoryId, snapshotId, JSON.stringify({ nodes: dbClient.getNodes(), edges: dbClient.getEdges() }), {
          nodeCount: result.nodeCount,
          edgeCount: result.edgeCount,
        });
      }).catch((err) => console.warn(`[supabase] persist warning: ${err.message}`));
    }

    // Persist the active graph so cold serverless requests can rehydrate it.
    await saveActiveGraphNow();

    return res.json({
      success: true,
      repoName: path.basename(targetDir),
      repoPath: targetDir,
      nodeCount: result.nodeCount,
      edgeCount: result.edgeCount,
      functionsCount,
      endpointsCount,
      dbSchemasCount,
      testsCount,
      snapshotId: dbClient.getSnapshotId(),
      storageMode: dbClient.getStorageModeInfo(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Analysis failed: ${err.message}` });
  }
});

// Repository analysis with REAL progress (Server-Sent Events). Each event marks
// an actual completed stage with real counts — not a fake climbing animation.
// EventSource is GET-only, so params come via the query string.
app.get('/api/repository/analyze/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  (res as any).flushHeaders?.();
  const send = (o: any) => res.write(`data: ${JSON.stringify(o)}\n\n`);
  const tick = () => new Promise((r) => setImmediate(r));

  try {
    const useDemo = req.query.useDemo === 'true';
    const rawPath = String(req.query.repoPath || '');
    let targetDir = activeRepoPath;

    send({ stage: 'validate', pct: 5, detail: 'Preparing repository' });
    await tick();

    if (useDemo || rawPath === 'demo' || rawPath === 'demo-app') {
      targetDir = path.resolve(process.cwd(), 'demo-app');
    } else if (rawPath) {
      const clean = rawPath.trim().replace(/^["']|["']$/g, '');
      if (isGitUrl(clean)) {
        send({ stage: 'clone', pct: 12, detail: 'Cloning repository from Git…' });
        await tick();
        targetDir = await cloneRepo(clean);
      } else {
        targetDir = path.resolve(clean);
      }
    }

    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
      send({ stage: 'error', error: `Repository path does not exist: ${targetDir}` });
      return res.end();
    }
    activeRepoPath = targetDir;

    send({ stage: 'discover', pct: 25, detail: 'Discovering source files…' });
    await tick();

    const analyzer = new RepositoryAnalyzer({ repoPath: targetDir }, dbClient);
    send({ stage: 'parse', pct: 45, detail: 'Parsing AST & building the dependency graph…' });
    await tick();

    // The heavy, deterministic pass (blocks while it runs — the "parse" stage
    // reflects this real work; the next event fires only once it truly finishes).
    const result = analyzer.analyze();

    const nodes = dbClient.getNodes();
    const functionsCount = nodes.filter((n) => n.type === 'Function' || n.type === 'Method').length;
    const endpointsCount = nodes.filter((n) => n.type === 'APIEndpoint').length;
    const dbSchemasCount = nodes.filter((n) => n.type === 'DBSchema').length;
    const testsCount = nodes.filter((n) => Boolean(n.metadata?.isTest)).length;
    const filesCount = nodes.filter((n) => n.type === 'File').length;

    send({ stage: 'detect', pct: 82, detail: `Found ${functionsCount} symbols, ${endpointsCount} endpoints, ${dbSchemasCount} DB dependencies` });
    await tick();

    recordRun({
      id: `run_${Date.now()}`,
      repoName: path.basename(targetDir),
      repoPath: targetDir,
      branch: (nodes.find((n) => n.type === 'Repository')?.metadata?.branch as string) || 'main',
      commitSha: (nodes.find((n) => n.type === 'Repository')?.commitSha as string) || 'HEAD',
      snapshotId: dbClient.getSnapshotId(),
      status: 'Completed',
      startedAt: new Date().toISOString(),
      files: filesCount,
      functions: functionsCount,
      endpoints: endpointsCount,
      dbSchemas: dbSchemasCount,
      tests: testsCount,
      nodeCount: result.nodeCount,
      edgeCount: result.edgeCount,
    });

    send({ stage: 'persist', pct: 94, detail: 'Persisting snapshot…' });
    await tick();

    // Background HydraDB context ingestion (non-blocking).
    void ingestSymbolContext(path.basename(targetDir), dbClient.getSnapshotId()).catch(() => {});
    await saveActiveGraphNow();

    send({
      stage: 'complete',
      pct: 100,
      detail: 'Analysis complete',
      summary: {
        repoName: path.basename(targetDir),
        repoPath: targetDir,
        nodeCount: result.nodeCount,
        edgeCount: result.edgeCount,
        functionsCount,
        endpointsCount,
        dbSchemasCount,
        testsCount,
        filesCount,
        snapshotId: dbClient.getSnapshotId(),
      },
    });
    res.end();
  } catch (err: any) {
    send({ stage: 'error', error: err.message || 'Analysis failed' });
    res.end();
  }
});

// API: Backend (Supabase) status — configured? reachable? can it write?
app.get('/api/backend/status', async (req, res) => {
  const status = supabaseStore.getStatus();
  if (!status.configured) {
    return res.json({ ...status, reachable: false, canPersist: false });
  }
  const ping = await supabaseStore.ping();
  res.json({
    ...status,
    reachable: ping.reachable,
    error: ping.error,
    canPersist: supabaseStore.canPersistServerSide(),
  });
});

// API: Dashboard aggregate (real data only, no fabricated metrics).
// ?repo=all (default) aggregates across the latest run per repository;
// ?repo=<name> scopes to a single repository's latest run.
app.get('/api/dashboard', (req, res) => {
  const scope = ((req.query.repo as string) || 'all').trim();
  const runs = loadRuns();

  // Latest run per repository (runs are newest-first).
  const latestByRepo = new Map<string, EvaluationRun>();
  for (const r of runs) {
    if (!latestByRepo.has(r.repoName)) latestByRepo.set(r.repoName, r);
  }
  const repos = [...latestByRepo.values()];
  const scoped = scope === 'all' ? repos : repos.filter((r) => r.repoName === scope);

  const sum = (key: keyof EvaluationRun) =>
    scoped.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);

  // Runtime coverage comes from the live active graph: an endpoint is verified
  // when a recorded execution trace exists for its "METHOD /path" route.
  const endpoints = dbClient.findNodes((n) => n.type === 'APIEndpoint');
  const verifiedRoutes = new Set(dbClient.getExecutionTraces().map((t) => t.name));
  const verifiedEndpoints = endpoints.filter((e) => verifiedRoutes.has(e.name)).length;
  const coverage = endpoints.length ? Math.round((verifiedEndpoints / endpoints.length) * 100) : 0;

  const scopedRuns = scope === 'all' ? runs : runs.filter((r) => r.repoName === scope);
  const recentRuns = scopedRuns.slice(0, 6);
  // Chronological history (oldest→newest) for the real trend chart.
  const history = scopedRuns
    .slice(0, 16)
    .reverse()
    .map((r) => ({ startedAt: r.startedAt, symbols: r.functions, endpoints: r.endpoints, files: r.files, nodes: r.nodeCount }));

  // Top repositories by symbol count (real).
  const topRepos = [...repos]
    .sort((a, b) => b.functions - a.functions)
    .slice(0, 5)
    .map((r) => ({ repoName: r.repoName, repoPath: r.repoPath, symbols: r.functions, endpoints: r.endpoints, files: r.files }));

  res.json({
    scope,
    repos: repos.map((r) => ({
      repoName: r.repoName,
      repoPath: r.repoPath,
      branch: r.branch,
      snapshotId: r.snapshotId,
      functions: r.functions,
      endpoints: r.endpoints,
      files: r.files,
      dbSchemas: r.dbSchemas,
      tests: r.tests,
      nodeCount: r.nodeCount,
      edgeCount: r.edgeCount,
      startedAt: r.startedAt,
      source: /^(https?:\/\/|git@)/.test(r.repoPath || '') ? 'git' : 'local',
    })),
    totals: {
      reposEvaluated: repos.length,
      totalAnalyses: runs.length,
      symbols: sum('functions'),
      endpoints: sum('endpoints'),
      files: sum('files'),
      dbSchemas: sum('dbSchemas'),
      tests: sum('tests'),
    },
    runtime: {
      coverage,
      verifiedEndpoints,
      totalEndpoints: endpoints.length,
      tracesRecorded: dbClient.getExecutionTraces().length,
      activeRepo: path.basename(activeRepoPath),
    },
    recentRuns,
    history,
    topRepos,
    hydra: dbClient.getStorageModeInfo(),
    graph: {
      nodes: dbClient.getNodes().length,
      edges: dbClient.getEdges().length,
      snapshotId: dbClient.getSnapshotId(),
    },
  });
});

// API 3: Global Symbol Search & Filtering
app.get('/api/symbols', (req, res) => {
  const query = ((req.query.q as string) || '').trim().toLowerCase();
  const allNodes = dbClient.getNodes();

  const filterableTypes = new Set(['Function', 'Method', 'Class', 'APIEndpoint', 'File', 'DBSchema', 'Module']);
  const searchableNodes = allNodes.filter((n) => filterableTypes.has(n.type));

  let matched = searchableNodes;
  if (query) {
    matched = searchableNodes.filter(
      (n) =>
        n.name.toLowerCase().includes(query) ||
        n.id.toLowerCase().includes(query) ||
        (n.filePath && n.filePath.toLowerCase().includes(query)) ||
        n.type.toLowerCase().includes(query)
    );
  }

  const results = matched.slice(0, 100).map((node) => {
    const inbound = dbClient.getInboundEdges(node.id);
    const outbound = dbClient.getOutboundEdges(node.id);
    return {
      node,
      calledByCount: inbound.length,
      callsCount: outbound.length,
    };
  });

  res.json({
    total: matched.length,
    query,
    symbols: results,
  });
});

// API 4: Symbol Detail View
app.get('/api/symbols/:id', (req, res) => {
  const symbolId = req.params.id;
  const node = dbClient.getNode(symbolId) || dbClient.findNodesByNameOrSymbol(symbolId)[0];

  if (!node) {
    return res.status(404).json({ error: `Symbol not found: ${symbolId}` });
  }

  const inboundEdges = dbClient.getInboundEdges(node.id);
  const outboundEdges = dbClient.getOutboundEdges(node.id);

  const calledBy = inboundEdges.map((e) => dbClient.getNode(e.from)).filter(Boolean);
  const calls = outboundEdges.map((e) => dbClient.getNode(e.to)).filter(Boolean);

  res.json({
    symbol: node,
    calledBy,
    calls,
    inboundEdgesCount: inboundEdges.length,
    outboundEdgesCount: outboundEdges.length,
  });
});

// API 5: Full HydraDB Graph State (for Architecture visualizer)
app.get('/api/graph', (req, res) => {
  res.json({
    nodes: dbClient.getNodes(),
    edges: dbClient.getEdges(),
    snapshotId: dbClient.getSnapshotId(),
    storageMode: dbClient.getStorageModeInfo(),
    repoPath: activeRepoPath,
    repoName: path.basename(activeRepoPath),
  });
});

// API 6: Recorded Runtime Traces
app.get('/api/traces', (req, res) => {
  const traceNodes = dbClient.getExecutionTraces();
  const traces = traceNodes.map((tn) => {
    const spans = dbClient.getExecutionSpansForTrace(tn.id);
    return {
      traceNode: tn,
      spans,
    };
  });
  res.json(traces);
});

// API 7: Trigger runtime trace collection for a bundled demo scenario.
//
// SECURITY: This never executes arbitrary commands or shells out. It runs one
// of a fixed, allow-listed set of demo scenarios in-process against the bundled
// demo application, recording a real ExecutionSpan tree. Runtime tracing of an
// arbitrary user repository is intentionally not exposed as a server endpoint;
// developers instrument their own app with TRACE's tracing SDK instead.
app.post('/api/runtime/run', async (req, res) => {
  try {
    const rawScenario = (req.body?.scenario ?? 'checkout') as string;
    const scenario = rawScenario as DemoScenario;
    if (!DEMO_SCENARIOS.includes(scenario)) {
      return res
        .status(400)
        .json({ error: `Unknown scenario. Allowed scenarios: ${DEMO_SCENARIOS.join(', ')}` });
    }

    // Runtime scenarios are only defined for the bundled demo application.
    const demoDir = path.resolve(process.cwd(), 'demo-app');
    const hookPath = path.join(demoDir, 'src', 'trace', 'hook.ts');
    if (path.resolve(activeRepoPath) !== demoDir || !fs.existsSync(hookPath)) {
      return res.status(409).json({
        error:
          'Runtime scenarios are available for the bundled demo app. Analyze the demo repository first, then run a scenario. To trace your own app, add the TRACE tracing SDK to it.',
      });
    }

    const result = await runDemoScenario(dbClient, demoDir, scenario);
    const tracesCount = dbClient.getExecutionTraces().length;
    await saveActiveGraphNow();

    return res.json({
      success: true,
      scenario: result.scenario,
      route: result.route,
      method: result.method,
      spanCount: result.spanCount,
      tracesRecorded: tracesCount,
      message: `Recorded runtime trace for ${result.method} ${result.route} (${result.spanCount} spans). ${tracesCount} traces in graph.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Runtime recording failed: ${err.message}` });
  }
});

// API: Import an existing runtime trace (a previously-recorded TRACE session).
// This is the "Upload trace" path — bring execution evidence recorded elsewhere
// (or earlier) and connect it to the current architecture graph. Accepts the
// TRACE trace shape: { traceNode, spans }. Spans link to static symbols by name.
app.post('/api/runtime/import', async (req, res) => {
  try {
    const trace = req.body?.trace || req.body;
    const traceNode = trace?.traceNode;
    const spans = Array.isArray(trace?.spans) ? trace.spans : [];
    if (!traceNode || !traceNode.name || spans.length === 0) {
      return res.status(400).json({ error: 'Invalid trace file. Expected { traceNode, spans } from a recorded TRACE session.' });
    }
    const traceId = `trace_import_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    dbClient.upsertNode({
      id: traceId,
      type: 'TraceRequest',
      name: String(traceNode.name),
      metadata: { ...(traceNode.metadata || {}), status: 'COMPLETED', imported: true, importedAt: new Date().toISOString() },
    });
    let count = 0;
    for (const s of spans) {
      if (!s?.name) continue;
      const spanId = `span_${traceId}_${count}`;
      dbClient.upsertNode({
        id: spanId,
        type: 'ExecutionSpan',
        name: String(s.name),
        metadata: { duration: Number(s.metadata?.duration ?? s.duration) || 0, functionName: s.metadata?.functionName || s.name, success: s.metadata?.success !== false, order: count, depth: Number(s.metadata?.depth ?? s.depth) || 0, imported: true },
      });
      dbClient.addEdge({ from: traceId, to: spanId, type: 'PARENT_OF' });
      // Connect to the static symbol so VERIFIED/UNOBSERVED intersection works.
      const staticNode = dbClient.findNodes((n) => (n.type === 'Function' || n.type === 'Method') && n.name === s.name)[0];
      if (staticNode) dbClient.addEdge({ from: spanId, to: staticNode.id, type: 'EXECUTED_FUNCTION' });
      count++;
    }
    dbClient.saveState();
    await saveActiveGraphNow();
    return res.json({ success: true, traceId, spanCount: count, message: `Imported ${count} spans for ${traceNode.name}.` });
  } catch (err: any) {
    return res.status(500).json({ error: `Trace import failed: ${err.message}` });
  }
});

// API 8: Change Impact Report for Target Symbol
app.get('/api/impact/:symbol', async (req, res) => {
  try {
    const rawSymbol = req.params.symbol;
    const depth = parseInt((req.query.depth as string) || '4', 10);

    let targetNode = dbClient.getNode(rawSymbol);
    if (!targetNode) {
      const matched = dbClient.findNodesByNameOrSymbol(rawSymbol);
      if (matched.length > 0) targetNode = matched[0];
    }

    if (!targetNode) {
      // No symbol specified: default to the most-connected function so the
      // Change Impact view opens on something meaningful. Repo-agnostic and
      // deterministic (degree desc, then id asc), never biased to a demo symbol.
      const fns = dbClient.findNodes((n) => n.type === 'Function' || n.type === 'Method');
      targetNode = fns
        .map((f) => ({ f, deg: dbClient.getInboundEdges(f.id).length + dbClient.getOutboundEdges(f.id).length }))
        .sort((a, b) => b.deg - a.deg || a.f.id.localeCompare(b.f.id))[0]?.f;
    }

    if (!targetNode) {
      return res.status(404).json({ error: 'No function symbols found in AST graph' });
    }

    const report = await intersectionEngine.generateReportAsync(targetNode.id, depth);
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API 9: Git Diff Auto-Detected Changed Symbols & Reports
app.get('/api/diff', async (req, res) => {
  const changedSymbols = gitDiffEngine.detectChangedSymbols();
  const reports = await Promise.all(
    changedSymbols.map(async (cs) => ({
      filePath: cs.filePath,
      symbol: cs.symbol,
      report: await intersectionEngine.generateReportAsync(cs.symbol.id),
    }))
  );
  res.json(reports);
});

// API 10: HydraDB Connection Ping & Refresh Status
app.get('/api/hydra/ping', async (req, res) => {
  await dbClient.pingConnection();
  res.json({
    storageMode: dbClient.getStorageModeInfo(),
  });
});

// API: Ask TRACE — natural-language question over the real TRACE engines.
// Evidence Mode works with no AI key; AI Explanation Mode activates if one is set.
app.post('/api/ask', async (req, res) => {
  try {
    const question = String(req.body?.question || '').trim();
    if (!question) return res.status(400).json({ error: 'Provide a question.' });
    if (dbClient.getNodes().length === 0) {
      return res.status(409).json({ error: 'Analyze a repository first, then ask about it.' });
    }
    const result = await answerQuestion(question, dbClient, intersectionEngine);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: `Ask failed: ${err.message}` });
  }
});

// API: Ask capabilities (does the server have an AI provider configured?).
app.get('/api/ask/status', (req, res) => {
  res.json({ ai: aiProviderInfo() });
});

// API 11: HydraDB overview — status, snapshot metadata, and graph counts.
app.get('/api/hydra/overview', (req, res) => {
  const nodes = dbClient.getNodes();
  res.json({
    storageMode: dbClient.getStorageModeInfo(),
    snapshotId: dbClient.getSnapshotId(),
    repoName: path.basename(activeRepoPath),
    repoPath: activeRepoPath,
    commitSha: (nodes.find((n) => n.type === 'Repository')?.commitSha as string) || 'HEAD',
    graph: { nodes: nodes.length, edges: dbClient.getEdges().length },
    // Per-symbol context documents that TRACE ingests into HydraDB on analyze.
    ingestedContextDocs: nodes.filter((n) => n.type === 'Function' || n.type === 'Method' || n.type === 'APIEndpoint').length,
  });
});

// API 12: Real HydraDB context retrieval (uses the installed @hydradb/sdk).
app.post('/api/hydra/query', async (req, res) => {
  try {
    const query = String(req.body?.query || '').trim();
    if (!query) return res.status(400).json({ error: 'Provide a query string.' });
    const results = await dbClient.queryContext(query, { maxResults: 8 });
    res.json({ query, results, storageMode: dbClient.getStorageModeInfo() });
  } catch (err: any) {
    res.status(500).json({ error: `HydraDB query failed: ${err.message}` });
  }
});

// Serve frontend static assets in production mode
const distWebPath = path.resolve(import.meta.dirname || '.', '../../dist-web');
app.use(express.static(distWebPath));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(distWebPath, 'index.html'), (err) => {
    if (err) {
      res.send(`
        <html>
          <body style="background:#09090b; color:#c9d1d9; font-family:sans-serif; padding:40px;">
            <h1>⚡ TRACE API Server is Running at http://localhost:${port}</h1>
            <p>Endpoints available:</p>
            <ul>
              <li><a href="/api/graph" style="color:#fafafa">/api/graph</a></li>
              <li><a href="/api/traces" style="color:#fafafa">/api/traces</a></li>
              <li><a href="/api/diff" style="color:#fafafa">/api/diff</a></li>
            </ul>
          </body>
        </html>
      `);
    }
  });
});

// Bind to loopback by default: TRACE reads local source files, so locally the
// API must not be network-reachable. Container/cloud hosts set TRACE_HOST=0.0.0.0
// so the platform can route to it (there, repos come from Git URLs, not disk).
const host = process.env.TRACE_HOST || (process.env.VERCEL ? '0.0.0.0' : '127.0.0.1');

if (!process.env.VERCEL) {
  app.listen(port, host, () => {
    const where = host === '127.0.0.1' ? 'localhost-only' : host;
    console.log(`\n⚡ TRACE server running at http://localhost:${port} (${where})`);
    console.log(`   Storage mode: ${dbClient.getStorageModeInfo().mode}\n`);
  });
}

export { app };
export default app;
