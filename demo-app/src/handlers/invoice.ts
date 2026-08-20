import { calculateTax } from '../services/tax.js';
import { traced } from '../trace/hook.js';

export function invoiceHandler(subtotal: number, customerName: string) {
  return traced('invoiceHandler', () => {
    const tax = calculateTax(subtotal, 0.1);
    return {
      invoiceId: `inv_${Date.now()}`,
      customerName,
      subtotal,
      tax,
      grandTotal: subtotal + tax,
    };
  });
}
