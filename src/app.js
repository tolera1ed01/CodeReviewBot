import express from 'express';
import { handleWebhook } from './webhookHandler.js';

const app = express();

// Must be registered before express.json() so webhook route gets raw Buffer
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.post('/webhook', handleWebhook);

export default app;
