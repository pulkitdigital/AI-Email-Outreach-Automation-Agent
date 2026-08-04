'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: false,
            // No retries: fail on the first attempt rather than TanStack Query's default 3-retry
            // exponential backoff. Two reasons, not just speed: (1) this is an internal ops tool
            // talking to one fixed backend — if it's unreachable, showing that immediately beats
            // smoothing over a blip, and most of these queries already poll on an interval, so a
            // failed attempt corrects itself on the next poll anyway; (2) TanStack Query's retry
            // continuation is gated on `document` having focus (`focusManager.isFocused()`,
            // independent of `networkMode`) — a backgrounded/unfocused tab can get a query stuck
            // at fetchStatus 'paused' indefinitely waiting for a retry that never gets permission
            // to run. Not retrying sidesteps that gate entirely, since the first attempt only
            // depends on networkMode, not focus.
            retry: false,
            networkMode: 'always',
          },
          mutations: {
            networkMode: 'always',
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {children}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
