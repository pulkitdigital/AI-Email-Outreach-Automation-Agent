import 'express';

declare global {
  namespace Express {
    interface Request {
      /**
       * The raw request body bytes, captured by index.ts's express.json({ verify }) hook.
       * Needed for HMAC signature verification (WhatsApp webhook's X-Hub-Signature-256) —
       * re-serializing req.body with JSON.stringify would not byte-for-byte match what Meta
       * actually signed (key ordering/whitespace can differ).
       */
      rawBody?: Buffer;
    }
  }
}
