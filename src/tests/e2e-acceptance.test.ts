import assert from 'node:assert';
import { test } from 'node:test';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { HydraDBClient } from '../core/hydradb/client.js';
import { RepositoryAnalyzer } from '../core/parser/analyzer.js';
import { RuntimeTracer } from '../core/runtime/tracer.js';
import { IntersectionEngine } from '../core/impact/intersection.js';

test('End-to-End Acceptance Test: TRACE Ingestion, Tracing, Intersection & Impact Report', async () => {
  const dbClient = new HydraDBClient({ dbPath: path.join(process.cwd(), '.trace', 'e2e_hydradb.json') });
  dbClient.clear();

  // Step 1: Analyze demo-app repository
  const demoAppDir = path.join(process.cwd(), 'demo-app');
  const analyzer = new RepositoryAnalyzer({ repoPath: demoAppDir }, dbClient);
  const parseResult = analyzer.analyze();

  // Step 2: Verify static graph in HydraDB
  assert.ok(parseResult.nodeCount > 5, 'Static graph node count should be > 5');
  assert.ok(parseResult.edgeCount > 5, 'Static graph edge count should be > 5');

  const taxFnNode = dbClient.findNodesByNameOrSymbol('calculateTax')[0];
  assert.ok(taxFnNode, 'calculateTax node must exist in static graph');

  // Dynamically load checkoutHandler from demo-app
  const checkoutModulePath = pathToFileURL(path.join(demoAppDir, 'src', 'handlers', 'checkout.ts')).href;
  const { checkoutHandler } = await import(checkoutModulePath);

  // Step 3 & 4: Record runtime trace execution
  const tracer = RuntimeTracer.getInstance(dbClient);
  await tracer.startTrace('POST /api/checkout', { route: '/api/checkout', method: 'POST' }, async () => {
    return tracer.traceFunction({ functionName: 'checkoutHandler' }, async () => {
      return checkoutHandler(100, 'test_user', 'tok_visa');
    })();
  });

  // Step 5: Verify runtime traces in HydraDB
  const traces = dbClient.getExecutionTraces();
  assert.ok(traces.length > 0, 'Runtime execution trace must be stored in HydraDB');

  // Step 6: Generate Intersection Impact Report for calculateTax
  const intersectionEngine = new IntersectionEngine(dbClient);
  const report = intersectionEngine.generateReport(taxFnNode.id);

  // Step 7: Verify Change Impact Report metrics & path classification
  assert.strictEqual(report.targetSymbol.name, 'calculateTax');
  assert.ok(report.totalAffectedNodes >= 3, 'Affected nodes should include callers, endpoints, db');
  assert.ok(report.verifiedPathCount >= 1, 'Should have at least 1 RUNTIME VERIFIED path');
  assert.ok(report.unobservedPathCount >= 1, 'Should have at least 1 UNOBSERVED path (invoice route)');

  // Endpoint verification
  const checkoutEp = report.endpoints.find((ep) => ep.endpointNode.name.includes('/checkout'));
  const invoiceEp = report.endpoints.find((ep) => ep.endpointNode.name.includes('/invoice'));

  assert.ok(checkoutEp, 'POST /api/checkout endpoint must be identified');
  assert.strictEqual(checkoutEp?.status, 'VERIFIED', 'POST /checkout must be classified as VERIFIED');

  if (invoiceEp) {
    assert.strictEqual(invoiceEp.status, 'UNOBSERVED', 'POST /invoice must be classified as UNOBSERVED');
  }

  console.log('✅ End-to-End Acceptance Test PASSED successfully!');
});
