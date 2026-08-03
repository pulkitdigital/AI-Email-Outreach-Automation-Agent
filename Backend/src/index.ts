import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { assertEmailProviderReady } from './providers/email/index.js';
import { categorizationRouter } from './routes/categorization.js';
import { decksRouter } from './routes/decks.js';
import { ingestionRouter } from './routes/ingestion.js';
import { leadsRouter } from './routes/leads.js';
import { repliesRouter } from './routes/replies.js';
import { schedulerRouter } from './routes/scheduler.js';
import { sendingRouter } from './routes/sending.js';
import { systemRouter } from './routes/system.js';
import { unsubscribeRouter } from './routes/unsubscribe.js';
import { webhooksRouter } from './routes/webhooks.js';

/**
 * Ingestion (Phase 1), Categorization (Phase 2), Deck Generation (Phase 3), Email
 * Composer/Sending Engine (Phase 4), and webhook/Daily Scheduler (Phase 5) are live below.
 */

// Fail loudly at boot if EMAIL_PROVIDER is misconfigured (e.g. 'gmail' before it's wired up),
// rather than crashing unexpectedly deep in a send job later. See providers/email/index.ts.
try {
  assertEmailProviderReady();
} catch (err) {
  console.error('[startup] email provider is not ready:', err);
  process.exit(1);
}

const app = express();

// Restricted to ALLOWED_ORIGINS (comma-separated) — not wide open. Local dev default covers
// the Frontend's dev server; add the Vercel production URL once Frontend is deployed (see
// ALLOWED_ORIGINS in .env.example).
const allowedOrigins = env.ALLOWED_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', emailProvider: env.EMAIL_PROVIDER, aiProvider: env.AI_PROVIDER });
});

app.use('/api/ingestion', ingestionRouter);
app.use('/api/categorization', categorizationRouter);
app.use('/api/decks', decksRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/sending', sendingRouter);
app.use('/api/scheduler', schedulerRouter);
app.use('/api/replies', repliesRouter);
app.use('/api/system', systemRouter);
// Not under /api — this is a public link clicked from an email client, not a JSON API.
app.use('/unsubscribe', unsubscribeRouter);
// Not under /api — Brevo (an external service) posts here directly; auth is a path-segment
// secret per route, not session/API-key auth. See routes/webhooks.ts and Docs/BREVO_INBOUND_SETUP.md.
app.use('/webhooks', webhooksRouter);

// Last-resort safety net: an uncaught error in any route handler must produce a logged 500,
// never a silently hung/crashed request, per the project's "no silent failures" requirement.
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[express] unhandled error:', err);
    res.status(500).json({ error: 'Internal server error — see server logs for details' });
  },
);

app.listen(env.PORT, () => {
  console.log(`Backend listening on port ${env.PORT} (${env.NODE_ENV})`);
});
