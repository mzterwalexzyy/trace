import { calculateTotal } from '../services/total.js';
import { chargeStripePayment } from '../services/stripe.js';
import { createOrderInDatabase } from '../db/order.js';
import { traced } from '../trace/hook.js';

export async function checkoutHandler(subtotal: number, userId: string, cardToken: string) {
  return traced('checkoutHandler', async () => {
    const pricing = calculateTotal(subtotal);
    const payment = await chargeStripePayment(pricing.total, cardToken);
    const order = createOrderInDatabase({ userId, total: pricing.total, items: ['Item A'] });

    return {
      success: true,
      pricing,
      payment,
      order,
    };
  });
}
