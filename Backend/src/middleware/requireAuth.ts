import type { NextFunction, Request, Response } from 'express';
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  signSessionToken,
  verifySessionToken,
} from '../modules/auth/authService.js';

/**
 * Protects every /api/* route except /api/auth/* (mounted before this middleware in index.ts —
 * see the comment there). Sliding expiry: a valid request re-issues the cookie with a fresh 7-day
 * expiry, so sessions last 7 days since last activity rather than 7 days since login.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    verifySessionToken(token);
  } catch {
    res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  res.cookie(SESSION_COOKIE_NAME, signSessionToken(), sessionCookieOptions());
  next();
}
