import assert from 'node:assert';
import { test } from 'node:test';
import { HydraDBClient } from '../core/hydradb/client.js';
import { RepositoryAnalyzer } from '../core/parser/analyzer.js';
import * as path from 'path';

test('Repo API Test: RepositoryAnalyzer executes AST parsing cleanly', async () => {
  const dbClient = new HydraDBClient();
  const demoPath = path.resolve(process.cwd(), 'demo-app');

  const analyzer = new RepositoryAnalyzer({ repoPath: demoPath }, dbClient);
  const result = analyzer.analyze();

  assert.ok(result.nodeCount > 0, 'AST node count must be greater than 0');
  assert.ok(result.edgeCount > 0, 'AST edge count must be greater than 0');

  const fnNodes = dbClient.findNodes((n) => n.type === 'Function');
  assert.ok(fnNodes.some((f) => f.name === 'calculateTax'), 'Must discover calculateTax function');

  const endpointNodes = dbClient.findNodes((n) => n.type === 'APIEndpoint');
  assert.ok(endpointNodes.some((ep) => ep.name.includes('/api/checkout')), 'Must discover POST /api/checkout endpoint');
});
