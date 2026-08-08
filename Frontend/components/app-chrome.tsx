'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { AppShell } from './app-shell';

const PUBLIC_PATHS = new Set(['/login']);

/**
 * Next.js middleware.ts can't do this redirect: Backend (Render) and Frontend (Vercel) are
 * different domains in production, so the httpOnly session cookie is scoped to the Backend's
 * domain and is never visible to edge middleware running on the Frontend's own domain. Gating
 * client-side instead, off GET /api/auth/me (a real fetch to the Backend, which does carry the
 * cookie) — see lib/auth-context.tsx.
 */
export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const isPublicPath = PUBLIC_PATHS.has(pathname);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated && !isPublicPath) router.replace('/login');
    if (isAuthenticated && isPublicPath) router.replace('/');
  }, [isAuthenticated, isLoading, isPublicPath, router]);

  if (isPublicPath) return <>{children}</>;

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
