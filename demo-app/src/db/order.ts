import { traced } from '../trace/hook.js';

export function createOrderInDatabase(orderData: { userId: string; total: number; items: string[] }): { orderId: string; status: string } {
  return traced('createOrderInDatabase', () => {
    console.log(`[Database Operation] INSERT INTO orders (user_id, total, status) VALUES ('${orderData.userId}', ${orderData.total}, 'PAID')`);
    return { orderId: `ord_${Date.now()}`, status: 'PAID' };
  });
}
