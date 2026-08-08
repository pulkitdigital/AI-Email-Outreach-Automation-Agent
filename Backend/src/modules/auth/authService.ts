import jwt from 'jsonwebtoken';
import type { CookieOptions } from 'express';
import { env } from '../../config/env.js';

/**
 * Single hardcoded admin account (no users table) — see routes/auth.ts. Payload is intentionally
 * minimal (just a role marker); there is nothing else to identify since there is only one admin.
 */
export interface SessionPayload {
  role: 'admin';
}

export const SESSION_COOKIE_NAME = 'bebeyond_session';

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export function signSessionToken(): string {
  return jwt.sign({ role: 'admin' } satisfies SessionPayload, env.JWT_SECRET, {
    expiresIn: SESSION_TTL_SECONDS,
  });
}

export function verifySessionToken(token: string): SessionPayload {
  return jwt.verify(token, env.JWT_SECRET) as SessionPayload;
}

/**
 * sameSite:'none' + secure:true unconditionally (not just in production) — Backend (Render) and
 * Frontend (Vercel) are different domains in production, so the session cookie must be sent
 * cross-site on every fetch; sameSite:'lax' would silently stop working there (Lax only allows
 * cross-site GET navigations, not fetch/XHR). Browsers treat http://localhost as a trustworthy
 * context, so `secure` cookies still get set/sent in local dev too — one config for both
 * environments instead of an env-conditional branch.
 */
export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000,
  };
}
