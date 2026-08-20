import assert from 'node:assert';
import { test } from 'node:test';
import { HydraDBClient } from '../core/hydradb/client.js';
import { RepositoryAnalyzer } from '../core/parser/analyzer.js';
import * as path from 'path';

test('Symbols API Test: Global Symbol Search and Detail View', async () => {
  const dbClient = new HydraDBClient();
  const demoPath = path.resolve(process.cwd(), 'demo-app');

  const analyzer = new RepositoryAnalyzer({ repoPath: demoPath }, dbClient);
  analyzer.analyze();

  const matched = dbClient.findNodesByNameOrSymbol('calculateTax');
  assert.ok(matched.length > 0, 'Must find calculateTax symbol node');

  const taxNode = matched[0];
  const inbound = dbClient.getInboundEdges(taxNode.id);
  const outbound = dbClient.getOutboundEdges(taxNode.id);

  assert.ok(Array.isArray(inbound), 'Inbound edges must be an array');
  assert.ok(Array.isArray(outbound), 'Outbound edges must be an array');
});
