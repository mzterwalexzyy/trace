import { HydraDBClient } from '../core/hydradb/client.js';
import { IntersectionEngine } from '../core/impact/intersection.js';
import { GraphNode } from '../core/hydradb/types.js';
import { getAIProvider } from './ai-provider.js';

/**
 * Ask TRACE — natural-language question layer.
 *
 * TRACE is the intelligence and evidence engine. A deterministic router maps the
 * question to the right EXISTING engine (impact / graph / runtime / HydraDB) and
 * returns real, grounded evidence. An optional AI provider only *explains* that
 * evidence — it never produces facts. With no AI key, Evidence Mode is fully
 * functional. No impact/graph logic is duplicated here.
 */

export type AskIntent =
  | 'change_impact'
  | 'symbol_relationship'
  | 'runtime_verification'
  | 'test_coverage'
  | 'database_dependency'
  | 'hydra_context_search'
  | 'architecture_exploration';

export interface AskResponse {
  question: string;
  intent: AskIntent;
  resolvedTargets: { id: string; name: string; type: string; filePath?: string }[];
  resolution: {
    confidence: number;
    alternatives: { id: string; name: string; type: string; filePath?: string }[];
  };
  evidence: any;
  answerMode: 'evidence' | 'ai';
  aiError?: string;
  answer: string;
  followUps: string[];
}

const INTENT_RULES: { intent: AskIntent; re: RegExp }[] = [
  { intent: 'test_coverage', re: /\b(test|tests|which test|what test|should i run)\b/i },
  { intent: 'runtime_verification', re: /\b(executed|actually run|has .* run|ran|observed|verified|runtime evidence|been hit|no runtime|blind spot)\b/i },
  { intent: 'change_impact', re: /\b(break|breaks|affect|affected|impact|change|modify|safe to|blast radius|what could)\b/i },
  { intent: 'database_dependency', re: /\b(database|db |schema|sql|writes?|reads?|persist|table)\b/i },
  { intent: 'symbol_relationship', re: /\b(how does|depend|depends|related|relationship|calls?|uses?|connected|import)\b/i },
  { intent: 'architecture_exploration', re: /\b(architecture|structure|overview|modules?|how is .* organi[sz]ed|layout)\b/i },
  { intent: 'hydra_context_search', re: /\b(context|find|about|history|documentation|notes?)\b/i },
];

export function classifyIntent(question: string): AskIntent {
  for (const r of INTENT_RULES) if (r.re.test(question)) return r.intent;
  return 'symbol_relationship';
}

/**
 * Deterministic symbol resolution scored by match quality:
 * exact name/endpoint > path > camelCase token overlap, then a type preference
 * (production functions/endpoints over files) and a strong test-file penalty.
 */
function scoreTargets(question: string, db: HydraDBClient): { n: GraphNode; score: number }[] {
  const q = ` ${question.toLowerCase()} `;
  const candidates = db.findNodes((n) =>
    ['Function', 'Method', 'APIEndpoint', 'Class', 'DBSchema', 'File'].includes(n.type)
  );
  const degree = (id: string) => db.getInboundEdges(id).length + db.getOutboundEdges(id).length;

  const scored: { n: GraphNode; score: number }[] = [];
  for (const n of candidates) {
    const name = (n.name || '').toLowerCase();
    if (name.length < 3) continue;
    let score = 0;
    const exactWord = q.includes(` ${name} `);
    if (exactWord) score = 130 + name.length; // exact standalone symbol name
    else if (q.includes(name)) score = 100 + name.length; // substring
    const p = (n.metadata?.path as string) || '';
    if (p && q.includes(p.toLowerCase())) score = Math.max(score, 120); // endpoint path
    if (!score) {
      const words = name.replace(/[^a-z0-9]+/gi, ' ').split(/(?=[A-Z])|\s+/).map((w) => w.toLowerCase()).filter((w) => w.length >= 4);
      const hits = words.filter((w) => q.includes(w)).length;
      if (hits) score = 40 + hits * 10; // camelCase token overlap
    }
    if (!score) continue;
    const typeWeight = n.type === 'Function' || n.type === 'Method' ? 30 : n.type === 'APIEndpoint' ? 22 : n.type === 'Class' ? 15 : n.type === 'DBSchema' ? 10 : 0;
    const isTest = /\.(test|spec)\.|\/tests?\//i.test(n.filePath || n.name || '') || Boolean(n.metadata?.isTest) || Boolean(n.metadata?.isTestFile);
    scored.push({ n, score: score + typeWeight + Math.min(degree(n.id), 20) - (isTest ? 60 : 0) });
  }
  scored.sort((a, b) => b.score - a.score || a.n.id.localeCompare(b.n.id));
  const seen = new Set<string>();
  const out: { n: GraphNode; score: number }[] = [];
  for (const s of scored) {
    if (seen.has(s.n.id)) continue;
    seen.add(s.n.id);
    out.push(s);
    if (out.length >= 6) break;
  }
  return out;
}

/** Resolve the symbols/endpoints a question refers to (top matches). */
export function resolveTargets(question: string, db: HydraDBClient): GraphNode[] {
  return scoreTargets(question, db).map((s) => s.n);
}

/** Resolution with a confidence score and selectable alternatives. */
export function resolveDetailed(question: string, db: HydraDBClient): {
  targets: GraphNode[];
  confidence: number;
  alternatives: GraphNode[];
} {
  const scored = scoreTargets(question, db);
  const targets = scored.map((s) => s.n);
  const top = scored[0];
  const confidence = top ? Math.min(1, Math.round((top.score / 170) * 100) / 100) : 0;
  // Alternatives: other matches within 60% of the top score (genuinely plausible).
  const alternatives = top
    ? scored.slice(1).filter((s) => s.score >= top.score * 0.6).map((s) => s.n).slice(0, 3)
    : [];
  return { targets, confidence, alternatives };
}

const light = (n: GraphNode) => ({ id: n.id, name: n.name, type: n.type, filePath: n.filePath });

export async function answerQuestion(
  question: string,
  db: HydraDBClient,
  intersection: IntersectionEngine,
  providerOverride?: import('./ai-provider.js').AIProvider | null
): Promise<AskResponse> {
  const intent = classifyIntent(question);
  const resolution = resolveDetailed(question, db);
  const targets = resolution.targets;
  const primary = targets[0];

  const evidence: any = {};
  let answer = '';
  const followUps: string[] = [];

  // Always attempt HydraDB context (best-effort, real retrieval).
  try {
    evidence.hydraContext = await db.queryContext(question, { maxResults: 4 });
  } catch {
    evidence.hydraContext = [];
  }

  if (!primary && intent !== 'architecture_exploration' && intent !== 'hydra_context_search' && intent !== 'database_dependency') {
    answer = `TRACE could not resolve a specific symbol or endpoint from your question. Try naming a function, file, or route (e.g. "calculateTax" or "/api/checkout").`;
    return finalize(question, intent, targets, resolution, evidence, answer, followUps, providerOverride);
  }

  if (intent === 'change_impact' || intent === 'test_coverage') {
    const report = await intersection.generateReportAsync(primary.id);
    const verified = report.endpoints.filter((e: any) => e.status === 'VERIFIED');
    const unobserved = report.endpoints.filter((e: any) => e.status === 'UNOBSERVED');
    evidence.impact = {
      target: light(report.targetSymbol),
      totalAffectedNodes: report.totalAffectedNodes,
      endpoints: report.endpoints.map((e: any) => ({ name: e.endpointNode.name, status: e.status, traceCount: e.traceCount })),
      dbSchemas: report.dbSchemas.map((s: any) => (s.schemaNode || s).name),
      tests: report.tests.map((t: any) => t.name || t),
    };
    const testList = evidence.impact.tests.length ? evidence.impact.tests.slice(0, 4).join(', ') : 'no tests directly linked in the graph';
    answer =
      `Changing ${primary.name} could affect ${report.totalAffectedNodes} nodes across the dependency graph, ` +
      `including ${report.endpoints.length} API endpoint${report.endpoints.length === 1 ? '' : 's'} and ${report.dbSchemas.length} database dependenc${report.dbSchemas.length === 1 ? 'y' : 'ies'}. ` +
      `Runtime evidence: ${verified.length} route${verified.length === 1 ? '' : 's'} VERIFIED, ${unobserved.length} UNOBSERVED (blind spot${unobserved.length === 1 ? '' : 's'}). ` +
      (intent === 'test_coverage' ? `Recommended tests to run: ${testList}.` : `Run the unobserved routes to close the blind spots before shipping.`);
    followUps.push(`Has ${primary.name} actually been executed?`, `What tests should I run if I change ${primary.name}?`);
  } else if (intent === 'runtime_verification') {
    const traces = db.getExecutionTraces();
    const spanNames = new Set(db.getNodes().filter((n) => n.type === 'ExecutionSpan').map((s) => (s.metadata?.functionName as string) || s.name));
    let observed = false;
    let detail = '';
    if (primary.type === 'APIEndpoint') {
      const t = traces.filter((tr) => tr.name === primary.name);
      observed = t.length > 0;
      detail = observed ? `observed in ${t.length} recorded trace${t.length === 1 ? '' : 's'}` : 'never observed in any recorded execution';
    } else {
      observed = spanNames.has(primary.name);
      detail = observed ? 'seen running in at least one recorded trace' : 'never seen in any recorded execution span';
    }
    evidence.runtime = { target: light(primary), observed, tracesRecorded: traces.length };
    answer = `${primary.name} has ${observed ? 'been executed' : 'NOT been executed'} — it is ${observed ? 'VERIFIED' : 'UNOBSERVED'} (${detail}). TRACE has ${traces.length} recorded runtime trace${traces.length === 1 ? '' : 's'} total.`;
    followUps.push(`What could break if I change ${primary.name}?`, `Which parts of this code have no runtime evidence?`);
  } else if (intent === 'symbol_relationship') {
    const callers = db.getInboundEdges(primary.id).map((e) => db.getNode(e.from)).filter(Boolean) as GraphNode[];
    const callees = db.getOutboundEdges(primary.id).map((e) => db.getNode(e.to)).filter(Boolean) as GraphNode[];
    evidence.relationships = {
      target: light(primary),
      calledBy: callers.map(light),
      calls: callees.map(light),
    };
    const cby = callers.slice(0, 5).map((c) => c.name).join(', ') || 'nothing in the graph';
    const cto = callees.slice(0, 5).map((c) => c.name).join(', ') || 'nothing in the graph';
    answer = `${primary.name} is called by: ${cby}. It calls / exposes: ${cto}. In total it has ${callers.length + callees.length} direct relationships in the static graph.`;
    followUps.push(`What could break if I change ${primary.name}?`, `Has ${primary.name} actually been executed?`);
  } else if (intent === 'database_dependency') {
    const schemas = db.findNodes((n) => n.type === 'DBSchema');
    evidence.database = {
      schemas: schemas.map((s) => {
        const writers = db.getInboundEdges(s.id).map((e) => db.getNode(e.from)?.name).filter(Boolean);
        return { name: s.name, touchedBy: writers.slice(0, 6) };
      }),
    };
    answer = schemas.length
      ? `TRACE found ${schemas.length} database schema/operation${schemas.length === 1 ? '' : 's'} in this repository: ${schemas.slice(0, 6).map((s) => s.name).join(', ')}. See the evidence for which functions read/write each.`
      : `TRACE found no database schemas or operations in the current graph for this repository.`;
    followUps.push('What could break if I change the database layer?', 'Find context about database writes.');
  } else if (intent === 'architecture_exploration') {
    const nodes = db.getNodes();
    const files = nodes.filter((n) => n.type === 'File').length;
    const fns = nodes.filter((n) => n.type === 'Function' || n.type === 'Method').length;
    const eps = nodes.filter((n) => n.type === 'APIEndpoint').length;
    const top = nodes
      .filter((n) => n.type === 'Function' || n.type === 'Method')
      .map((n) => ({ n, d: db.getInboundEdges(n.id).length + db.getOutboundEdges(n.id).length }))
      .sort((a, b) => b.d - a.d)[0];
    evidence.architecture = { files, functions: fns, endpoints: eps, mostConnected: top ? { name: top.n.name, degree: top.d } : null };
    answer = `This repository has ${files} files, ${fns} functions/methods and ${eps} API endpoints. ${top ? `The most connected symbol is ${top.n.name} (${top.d} relationships).` : ''} Open the Architecture page to explore it visually.`;
    followUps.push(top ? `What could break if I change ${top.n.name}?` : 'What could break if I change checkout?', 'Find context about database writes.');
  } else {
    // hydra_context_search
    answer = evidence.hydraContext?.length
      ? `TRACE retrieved ${evidence.hydraContext.length} relevant context result${evidence.hydraContext.length === 1 ? '' : 's'} from HydraDB for "${question}". See the related context below.`
      : `TRACE found no relevant HydraDB context for "${question}". Try naming a specific symbol, file, or feature.`;
    followUps.push('What could break if I change calculateTax?', 'How does checkout depend on tax calculation?');
  }

  return finalize(question, intent, targets, resolution, evidence, answer, followUps, providerOverride);
}

/**
 * Validate an AI explanation before trusting it. This is defence-in-depth on top
 * of the system prompt: the AI must not silently drop the UNOBSERVED distinction
 * or fabricate a different affected-node count than TRACE computed.
 */
function validateExplanation(text: string, evidence: any): boolean {
  const t = (text || '').trim();
  if (t.length < 8) return false; // empty / malformed
  // If TRACE says a runtime path is UNOBSERVED, the AI must not claim it runs/verified.
  const hasUnobserved =
    evidence?.runtime?.observed === false ||
    (Array.isArray(evidence?.impact?.endpoints) && evidence.impact.endpoints.some((e: any) => e.status === 'UNOBSERVED')) ||
    /UNOBSERVED/.test(JSON.stringify(evidence || {}));
  if (hasUnobserved && /\b(verified at runtime|confirmed in production|definitely runs|is executed in production)\b/i.test(t)) {
    return false;
  }
  // Preserve the exact affected-node count if TRACE reported one.
  const n = evidence?.impact?.totalAffectedNodes;
  if (typeof n === 'number') {
    const nums = (t.match(/\b\d{2,}\b/g) || []).map(Number);
    // If the text cites large numbers but never the real one, it likely invented figures.
    if (nums.length && !nums.includes(n) && nums.some((m) => Math.abs(m - n) > 0)) {
      // tolerate — only reject when it explicitly claims a different "affected" count
      if (new RegExp(`\\b(\\d{2,})\\b[^.]{0,40}affect`, 'i').test(t)) {
        const claimed = Number(RegExp.$1);
        if (claimed !== n) return false;
      }
    }
  }
  return true;
}

async function finalize(
  question: string,
  intent: AskIntent,
  targets: GraphNode[],
  resolution: { targets: GraphNode[]; confidence: number; alternatives: GraphNode[] },
  evidence: any,
  evidenceAnswer: string,
  followUps: string[],
  providerOverride?: import('./ai-provider.js').AIProvider | null
): Promise<AskResponse> {
  const base: AskResponse = {
    question,
    intent,
    resolvedTargets: targets.map(light),
    resolution: { confidence: resolution.confidence, alternatives: resolution.alternatives.map(light) },
    evidence,
    answerMode: 'evidence',
    answer: evidenceAnswer,
    followUps,
  };

  // Grounding guard: if TRACE resolved no symbol AND produced no structured
  // evidence (impact/relationships/runtime/database/architecture), there is
  // nothing for the AI to explain — letting it answer would invite fabrication.
  // Return the deterministic "could not resolve" message instead.
  const hasStructuredEvidence = Boolean(
    evidence.impact || evidence.relationships || evidence.runtime || evidence.database || evidence.architecture
  );
  if (targets.length === 0 && !hasStructuredEvidence) {
    return base;
  }

  // AI Explanation Mode (optional): the model ONLY explains TRACE's evidence.
  // providerOverride lets tests inject a mock/failing provider. `null` disables.
  const ai = providerOverride !== undefined ? providerOverride : getAIProvider();
  if (ai) {
    try {
      const withTimeout = <T,>(p: Promise<T>, ms: number) =>
        Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('AI timeout')), ms))]);
      const explained = await withTimeout(ai.explain(question, { intent, resolvedTargets: base.resolvedTargets, evidence }), 20000);
      if (validateExplanation(explained, evidence)) {
        base.answer = explained.trim();
        base.answerMode = 'ai';
      } else {
        base.aiError = 'AI response failed grounding validation; showing evidence answer.';
      }
    } catch (err: any) {
      base.aiError = `AI unavailable (${err.message}); showing evidence answer.`;
      console.warn(`[ask] AI explanation failed, using evidence answer: ${err.message}`);
    }
  }
  return base;
}
