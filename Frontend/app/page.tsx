'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useSystemStatus } from '@/lib/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/status-badge';
import { formatRelative } from '@/lib/format';

function ProviderCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl capitalize">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

interface FailureSectionProps {
  title: string;
  count: number;
  emptyLabel: string;
  children: React.ReactNode;
}

function FailureSection({ title, count, emptyLabel, children }: FailureSectionProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
        {count > 0 ? (
          <Badge variant="destructive">{count}</Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> 0
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {count === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ul className="divide-y">{children}</ul>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  primary,
  secondary,
  right,
  href,
}: {
  primary: string;
  secondary: string;
  right: React.ReactNode;
  href?: string;
}) {
  const inner = (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{primary}</p>
        <p className="truncate text-xs text-muted-foreground">{secondary}</p>
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
  return href ? (
    <li>
      <Link href={href} className="block hover:bg-muted/50 rounded-md px-2 -mx-2">
        {inner}
      </Link>
    </li>
  ) : (
    <li className="px-2 -mx-2">{inner}</li>
  );
}

export default function SystemStatusPage() {
  const { data, isLoading, isError, error } = useSystemStatus();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">System Status</h1>
        <p className="text-sm text-muted-foreground">
          Active providers and everything that needs attention, in one place.
        </p>
      </div>

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-2 pt-6 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Failed to load system status: {error instanceof Error ? error.message : 'Unknown error'}
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )}

      {data && (
        <div className="grid gap-4 sm:grid-cols-2">
          <ProviderCard label="Active Email Provider" value={data.emailProvider} />
          <ProviderCard label="Active AI Provider" value={data.aiProvider} />
        </div>
      )}

      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      )}

      {data && (
        <div className="grid gap-4 md:grid-cols-2">
          <FailureSection
            title="Failed Sends"
            count={data.failedSends.count}
            emptyLabel="No failed sends."
          >
            {data.failedSends.recent.map((log) => (
              <Row
                key={log.id}
                primary={log.leadEmail}
                secondary={`${log.sequenceStage} · ${log.errorMessage ?? 'no error message'}`}
                right={
                  <span className="text-xs text-muted-foreground">
                    {formatRelative(log.updatedAt)}
                  </span>
                }
                href={`/leads/${log.leadId}`}
              />
            ))}
          </FailureSection>

          <FailureSection
            title="Failed Deck Generations"
            count={data.failedDecks.count}
            emptyLabel="No failed deck generations."
          >
            {data.failedDecks.recent.map((deck) => (
              <Row
                key={deck.id}
                primary={deck.companyName ?? deck.leadEmail}
                secondary={deck.generationError ?? 'no error message'}
                right={
                  <span className="text-xs text-muted-foreground">
                    {formatRelative(deck.updatedAt)}
                  </span>
                }
                href={`/leads/${deck.leadId}`}
              />
            ))}
          </FailureSection>

          <FailureSection
            title="Failed / Partial Ingestions"
            count={data.failedIngestions.count}
            emptyLabel="No failed ingestions."
          >
            {data.failedIngestions.recent.map((job) => (
              <Row
                key={job.id}
                primary={job.sourceReference}
                secondary={`${job.totalErrors} error(s) · ${job.totalRowsFlaggedForReview} flagged for review`}
                right={<StatusBadge status={job.status} />}
                href="/ingestion"
              />
            ))}
          </FailureSection>

          <FailureSection
            title="Needs Review Leads"
            count={data.needsReviewLeads.count}
            emptyLabel="No leads awaiting review."
          >
            {data.needsReviewLeads.recent.map((lead) => (
              <Row
                key={lead.id}
                primary={lead.companyName ?? lead.email}
                secondary={lead.reviewReason ?? 'no reason recorded'}
                right={
                  <span className="text-xs text-muted-foreground">
                    {formatRelative(lead.updatedAt)}
                  </span>
                }
                href={`/leads/${lead.id}`}
              />
            ))}
          </FailureSection>
        </div>
      )}
    </div>
  );
}
