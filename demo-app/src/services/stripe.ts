import { traced } from '../trace/hook.js';

export async function chargeStripePayment(amount: number, cardToken: string): Promise<{ success: boolean; chargeId: string }> {
  return traced('chargeStripePayment', async () => {
    // Stripe API call mock
    console.log(`[Stripe External API] Charging $${amount} via token ${cardToken}`);
    return { success: true, chargeId: `ch_${Date.now()}` };
  });
}
