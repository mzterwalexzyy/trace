import { calculateTax } from './tax.js';
import { traced } from '../trace/hook.js';

export function calculateTotal(subtotal: number, shippingFee: number = 5.0): { subtotal: number; tax: number; total: number } {
  return traced('calculateTotal', () => {
    const tax = calculateTax(subtotal);
    const total = Math.round((subtotal + tax + shippingFee) * 100) / 100;
    return { subtotal, tax, total };
  });
}
