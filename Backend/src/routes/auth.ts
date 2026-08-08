import { Router } from 'express';
import { env } from '../config/env.js';
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  signSessionToken,
  verifySessionToken,
} from '../modules/auth/authService.js';

export const authRouter = Router();

/**
 * POST /api/auth/login — compares against the single hardcoded admin account (ADMIN_EMAIL/
 * ADMIN_PASSWORD env vars, not a users table — see config/env.ts). Plain string comparison is
 * intentional: there is exactly one account, not a user table to protect against timing-based
 * enumeration across many accounts.
 */
authRouter.post('/login', (req, res) => {
  const { email, password } = req.body as { email?: unknown; password?: unknown };

  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  if (email !== env.ADMIN_EMAIL || password !== env.ADMIN_PASSWORD) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  res.cookie(SESSION_COOKIE_NAME, signSessionToken(), sessionCookieOptions());
  res.json({ authenticated: true });
});

/** POST /api/auth/logout — clears the session cookie regardless of whether it was still valid. */
authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
  res.json({ status: 'ok' });
});

/** GET /api/auth/me — used by the Frontend on app load to check whether a session is active. */
authRouter.get('/me', (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;

  if (!token) {
    res.status(401).json({ authenticated: false });
    return;
  }

  try {
    verifySessionToken(token);
    res.json({ authenticated: true });
  } catch {
    res.status(401).json({ authenticated: false });
  }
});
