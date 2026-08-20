import assert from 'node:assert';
import { test } from 'node:test';
import * as path from 'path';
import { HydraDBClient } from '../core/hydradb/client.js';
import { RepositoryAnalyzer } from '../core/parser/analyzer.js';
import { IntersectionEngine } from '../core/impact/intersection.js';
import { answerQuestion, classifyIntent, resolveTargets } from '../server/ask.js';

// Ask TRACE — Evidence Mode (no AI key). Every answer must be grounded in the
// real deterministic engines, never fabricated.
test('Ask TRACE: Evidence Mode grounds answers in real TRACE engines', async () => {
  const dbClient = new HydraDBClient({ dbPath: path.join(process.cwd(), '.trace', 'ask_test.json') });
  dbClient.clear();
  const analyzer = new RepositoryAnalyzer({ repoPath: path.join(process.cwd(), 'demo-app') }, dbClient);
  analyzer.analyze();
  const intersection = new IntersectionEngine(dbClient);

  // Intent classification is deterministic.
  assert.strictEqual(classifyIntent('What could break if I change calculateTax?'), 'change_impact');
  assert.strictEqual(classifyIntent('Has the invoice flow actually been executed?'), 'runtime_verification');
  assert.strictEqual(classifyIntent('Find context about database writes'), 'database_dependency');

  // Symbol resolution finds real symbols.
  const targets = resolveTargets('What could break if I change calculateTax?', dbClient);
  assert.ok(targets.some((t) => t.name === 'calculateTax'), 'resolveTargets must find calculateTax');

  // 1) Change impact question → uses the impact engine, returns real evidence.
  const impact = await answerQuestion('What could break if I change calculateTax?', dbClient, intersection);
  assert.strictEqual(impact.intent, 'change_impact');
  assert.strictEqual(impact.answerMode, 'evidence', 'no AI key → Evidence Mode');
  assert.ok(impact.resolvedTargets.some((t) => t.name === 'calculateTax'));
  assert.ok(impact.evidence.impact, 'must include real impact evidence');
  assert.ok(impact.evidence.impact.endpoints.length >= 1, 'demo has affected endpoints');
  // The demo's checkout + invoice both reach calculateTax.
  const epNames = impact.evidence.impact.endpoints.map((e: any) => e.name);
  assert.ok(epNames.some((n: string) => n.includes('/api/checkout')));

  // 2) Relationship question → static caller/callee evidence.
  const rel = await answerQuestion('How does checkout depend on tax calculation?', dbClient, intersection);
  assert.strictEqual(rel.intent, 'symbol_relationship');
  assert.ok(rel.evidence.relationships, 'must include relationship evidence');

  // 3) Runtime question → runtime evidence; with no traces recorded it is UNOBSERVED.
  const runtime = await answerQuestion('Has the invoice flow actually been executed?', dbClient, intersection);
  assert.strictEqual(runtime.intent, 'runtime_verification');
  assert.ok(runtime.evidence.runtime, 'must include runtime evidence');
  assert.strictEqual(runtime.evidence.runtime.observed, false, 'no traces recorded → UNOBSERVED');
  assert.match(runtime.answer, /UNOBSERVED|NOT been executed/);

  // 4) Database question → schema evidence from the AST graph.
  const db = await answerQuestion('Find context about database writes', dbClient, intersection);
  assert.strictEqual(db.intent, 'database_dependency');
  assert.ok(db.evidence.database, 'must include database evidence');
  assert.ok(Array.isArray(db.evidence.database.schemas));

  console.log('✅ Ask TRACE Evidence Mode: all intents grounded in real engines.');
});

test('Ask TRACE: AI Explanation Mode is optional, validated, and never authoritative', async () => {
  const dbClient = new HydraDBClient({ dbPath: path.join(process.cwd(), '.trace', 'ask_ai_test.json') });
  dbClient.clear();
  new RepositoryAnalyzer({ repoPath: path.join(process.cwd(), 'demo-app') }, dbClient).analyze();
  const intersection = new IntersectionEngine(dbClient);

  const mock = (fn: (q: string, e: unknown) => Promise<string> | string) => ({ name: 'mock', explain: async (q: string, e: unknown) => fn(q, e) });
  const Q = 'What could break if I change calculateTax?';

  // 1) AI success → answerMode 'ai', answer is the (valid, grounded) explanation.
  const ok = await answerQuestion(Q, dbClient, intersection, mock(() => 'calculateTax affects 42 nodes; both routes are UNOBSERVED.'));
  assert.strictEqual(ok.answerMode, 'ai');
  assert.match(ok.answer, /42/);

  // 2) AI failure → falls back to Evidence Mode, deterministic answer preserved.
  const fail = await answerQuestion(Q, dbClient, intersection, mock(() => { throw new Error('rate limited'); }));
  assert.strictEqual(fail.answerMode, 'evidence');
  assert.match(fail.answer, /could affect \d+ nodes/);
  assert.ok(fail.aiError, 'aiError should be recorded on failure');

  // 3) Malformed / empty AI output → Evidence Mode.
  const empty = await answerQuestion(Q, dbClient, intersection, mock(() => ''));
  assert.strictEqual(empty.answerMode, 'evidence');

  // 4) No provider (null) → Evidence Mode.
  const noai = await answerQuestion(Q, dbClient, intersection, null);
  assert.strictEqual(noai.answerMode, 'evidence');

  // 5) UNOBSERVED grounding: an AI that claims runtime verification is rejected.
  const rt = await answerQuestion('Has the invoice flow actually been executed?', dbClient, intersection, mock(() => 'Yes, this is verified at runtime and confirmed in production.'));
  assert.strictEqual(rt.answerMode, 'evidence', 'AI claiming runtime verification over UNOBSERVED must be rejected');

  // 6) Numeric grounding: an AI that cites a different affected count is rejected.
  const numeric = await answerQuestion(Q, dbClient, intersection, mock(() => 'Changing this affects 999 affected nodes across the app.'));
  assert.strictEqual(numeric.answerMode, 'evidence', 'AI substituting a wrong count must be rejected');

  // 7) Ambiguity: "checkout" matches multiple symbols → alternatives surfaced.
  const amb = await answerQuestion('What could break if I change checkout?', dbClient, intersection, null);
  assert.ok(amb.resolution.alternatives.length >= 1, 'ambiguous query should expose alternatives');
  assert.ok(amb.resolution.confidence > 0 && amb.resolution.confidence <= 1);

  console.log('✅ Ask TRACE AI Mode: grounded, validated, and safely optional.');
});
