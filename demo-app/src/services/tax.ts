import { traced } from '../trace/hook.js';

/**
 * Calculate tax for order subtotal.
 * Target function for TRACE Blast Radius & Git Diff analysis.
 */
export function calculateTax(subtotal: number, taxRate: number = 0.08): number {
  return traced('calculateTax', () => {
    if (subtotal <= 0) return 0;
    return Math.round(subtotal * taxRate * 100) / 100;
  });
}
