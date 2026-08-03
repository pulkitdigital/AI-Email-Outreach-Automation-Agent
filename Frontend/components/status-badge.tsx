import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { titleCase } from '@/lib/format';

const GOOD = new Set([
  'sent',
  'delivered',
  'completed',
  'ready',
  'deck_generated',
  'in_sequence',
  'categorized',
  'opened',
]);
const BAD = new Set([
  'failed',
  'bounced',
  'partial',
  'do_not_contact',
  'stopped_bounce',
  'cancelled',
]);
const WARN = new Set(['needs_review', 'pending', 'queued', 'processing', 'sending', 'generating']);
const NEUTRAL_STOPPED = new Set([
  'stopped_reply',
  'stopped_unsubscribe',
  'stopped_manual',
  'replied',
]);

/** Generic status pill reused across leads/sends/decks/ingestion jobs/sequence stages — colors are semantic (good/bad/warn/neutral), not per-domain. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = GOOD.has(status)
    ? 'good'
    : BAD.has(status)
      ? 'bad'
      : WARN.has(status)
        ? 'warn'
        : NEUTRAL_STOPPED.has(status)
          ? 'neutral'
          : 'neutral';

  return (
    <Badge
      variant="outline"
      className={cn(
        'font-normal',
        tone === 'good' &&
          'border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
        tone === 'bad' && 'border-destructive/30 bg-destructive/10 text-destructive',
        tone === 'warn' && 'border-brand-orange/40 bg-brand-orange/10 text-brand-orange',
        tone === 'neutral' && 'text-muted-foreground',
        className,
      )}
    >
      {titleCase(status)}
    </Badge>
  );
}
