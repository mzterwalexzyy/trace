import assert from 'node:assert';
import { test } from 'node:test';
import { calculateTax } from '../src/services/tax.js';

test('calculateTax computes correct tax amount', () => {
  const result = calculateTax(100, 0.08);
  assert.strictEqual(result, 8);
});
