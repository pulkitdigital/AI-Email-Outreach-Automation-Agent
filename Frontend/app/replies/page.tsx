'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useReplies } from '@/lib/hooks';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';
import type { ReplyListItem } from '@/lib/types';

const PAGE_SIZE = 20;
const TRUNCATE_AT = 400;

function ReplyCard({ reply }: { reply: ReplyListItem }) {
  const [expanded, setExpanded] = useState(false);
  const body = reply.bodySnapshot ?? '(no body captured)';
  const isLong = body.length > TRUNCATE_AT;
  const shown = expanded || !isLong ? body : `${body.slice(0, TRUNCATE_AT)}…`;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Link href={`/leads/${reply.leadId}`} className="font-medium hover:underline">
              {reply.companyName ?? reply.leadEmail}
            </Link>
            <p className="text-xs text-muted-foreground">
              {reply.fromEmail} · {reply.providerName}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">{formatDateTime(reply.receivedAt)}</p>
        </div>
        {reply.subject && <p className="mt-1 text-sm font-medium">{reply.subject}</p>}
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{shown}</p>
        {isLong && (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? 'Show less' : 'Show more'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function RepliesPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error } = useReplies({
    search: search || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Replies</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} repl${data.total === 1 ? 'y' : 'ies'}` : 'Loading…'}
        </p>
      </div>

      <Input
        placeholder="Search by email, company, or subject…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="max-w-80"
      />

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="pt-6 text-sm text-destructive">
            Failed to load replies: {error instanceof Error ? error.message : 'Unknown error'}
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {data && data.replies.length === 0 && (
        <p className="text-sm text-muted-foreground">No replies yet.</p>
      )}

      <div className="space-y-3">
        {data?.replies.map((reply) => (
          <ReplyCard key={reply.id} reply={reply} />
        ))}
      </div>

      {data && data.replies.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
