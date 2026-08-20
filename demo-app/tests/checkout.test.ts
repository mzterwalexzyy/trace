import assert from 'node:assert';
import { test } from 'node:test';
import { checkoutHandler } from '../src/handlers/checkout.js';

test('checkoutHandler processes payment and creates order', async () => {
  const result = await checkoutHandler(100, 'usr_999', 'tok_visa');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.pricing.total, 113); // 100 + 8 tax + 5 shipping
});
