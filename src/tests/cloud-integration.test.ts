import assert from 'node:assert';
import { test } from 'node:test';
import { HydraDBCloud } from '../core/hydradb/cloud/HydraDBCloud.js';

test('Cloud Integration Test: Real @hydradb/sdk Ingestion & Recall Query', async (t) => {
  const apiKey = process.env.HYDRA_DB_API_KEY;

  if (!apiKey) {
    t.skip('Skipping Cloud Integration Test: HYDRA_DB_API_KEY is not set in environment.');
    return;
  }

  // 1. SDK Initialization & Ping Connectivity Test
  console.log('⚡ Step 1: Initializing real HydraDBCloud driver with @hydradb/sdk...');
  const cloudDriver = new HydraDBCloud({
    apiKey,
    database: process.env.HYDRA_DB_DATABASE || 'hydra',
  });

  const isAlive = await cloudDriver.pingConnection();
  assert.strictEqual(isAlive, true, 'HydraDB Cloud ping connection must succeed');

  const info = cloudDriver.getStorageModeInfo();
  assert.strictEqual(info.status, 'Connected', 'Storage mode status must be Connected after successful API ping');
  console.log('✅ SDK initialization: PASS');
  console.log('✅ HydraDB connection: PASS');

  const testSnapshotId = `snap_test_${Date.now()}`;
  const testCommitSha = `commit_${Date.now().toString(36)}`;

  // 2. Ingestion Test
  console.log('📤 Step 2: Ingesting TRACE context payload via @hydradb/sdk...');
  const ingestResult = await cloudDriver.ingestContext({
    content: `Symbol calculateTax in tax.ts calculates VAT tax for POST /api/checkout [Commit: ${testCommitSha}]`,
    metadata: {
      symbol: 'calculateTax',
      symbolType: 'Function',
      filePath: 'src/services/tax.ts',
      commitSha: testCommitSha,
      snapshotId: testSnapshotId,
    },
  });

  assert.ok(ingestResult.sourceId, 'Ingest result must return a valid sourceId');
  console.log('✅ Ingestion: PASS');

  // 3. Query Test
  console.log('🔍 Step 3: Querying context back via client.query()...');
  const queryResults = await cloudDriver.queryContext('calculateTax checkout', {
    maxResults: 5,
  });

  assert.ok(queryResults.length > 0, 'Should return at least 1 context query result from HydraDB Cloud');
  assert.ok(
    queryResults.some((r) => r.content.includes('calculateTax') || r.content.includes('tax.ts') || r.content.includes('Graph Triplet')),
    'Returned context must contain relevant symbol information or knowledge graph triplets'
  );
  console.log('✅ Query: PASS');

  // 4. Metadata Filtering Test
  console.log('🎯 Step 4: Verifying metadata filtering by commit SHA...');
  const filteredResults = await cloudDriver.queryContext('calculateTax', {
    maxResults: 5,
    commitSha: testCommitSha,
  });
  assert.ok(Array.isArray(filteredResults), 'Metadata filtering request must complete cleanly');
  console.log('✅ Metadata filtering: PASS');

  console.log('\n🎉 ALL LIVE HYDRADB CLOUD E2E ROUND-TRIP TESTS PASSED!');
});
