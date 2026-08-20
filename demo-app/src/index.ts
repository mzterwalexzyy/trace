import express from 'express';
import { checkoutHandler } from './handlers/checkout.js';
import { invoiceHandler } from './handlers/invoice.js';

const app = express();
app.use(express.json());

app.post('/api/checkout', async (req, res) => {
  const { subtotal, userId, cardToken } = req.body || { subtotal: 100, userId: 'usr_123', cardToken: 'tok_visa' };
  const result = await checkoutHandler(subtotal, userId, cardToken);
  res.json(result);
});

app.get('/api/invoice', (req, res) => {
  const subtotal = parseFloat((req.query.subtotal as string) || '250');
  const result = invoiceHandler(subtotal, 'Acme Corp');
  res.json(result);
});

const PORT = process.env.DEMO_PORT || 4000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[Demo App] Express server running at http://localhost:${PORT}`);
  });
}

export { app };
