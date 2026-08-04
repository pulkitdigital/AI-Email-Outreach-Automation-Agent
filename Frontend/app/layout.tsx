import type { Metadata } from 'next';
import './globals.css';
import { Geist } from 'next/font/google';
import { cn } from '@/lib/utils';
import { Providers } from './providers';
import { AppShell } from '@/components/app-shell';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'BeBeyond Outreach Dashboard',
  description: 'AI Email Outreach Automation Agent — BeBeyond Digital Solutions',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn('font-sans', geist.variable)}>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
