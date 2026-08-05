'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useWhatsAppMessages } from '@/lib/hooks';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import { formatDateTime, titleCase } from '@/lib/format';
import type { WhatsAppMessageListItem } from '@/lib/types';

const PAGE_SIZE = 20;
const ALL = '__all__';

function MessageCard({ message }: { message: WhatsAppMessageListItem }) {
  const isInbound = message.direction === 'inbound';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            {message.leadId ? (
              <Link href={`/leads/${message.leadId}`} className="font-medium hover:underline">
                {message.companyName ?? message.leadEmail}
              </Link>
            ) : (
              <p className="font-medium text-muted-foreground">Unmatched</p>
            )}
            <p className="text-xs text-muted-foreground">
              {message.fromPhoneNumber ?? '—'} · {isInbound ? 'Inbound' : 'Outbound'} ·{' '}
              {titleCase(message.messageType)}
              {message.templateName ? ` (${message.templateName})` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={message.status} />
            <p className="text-xs text-muted-foreground">{formatDateTime(message.createdAt)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {message.bodyPreview ?? '(no content captured)'}
        </p>
        {message.errorMessage && (
          <p className="mt-2 text-sm text-destructive">{message.errorMessage}</p>
        )}
        {message.leadId && message.leadOptedIn === false && (
          <p className="mt-2 text-xs text-brand-orange">Lead is not currently opted in</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function WhatsAppPage() {
  const [matched, setMatched] = useState(ALL);
  const [optedIn, setOptedIn] = useState(ALL);
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error } = useWhatsAppMessages({
    matched: matched === ALL ? undefined : matched === 'true',
    optedIn: optedIn === ALL ? undefined : optedIn === 'true',
    page,
    pageSize: PAGE_SIZE,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} message${data.total === 1 ? '' : 's'}` : 'Loading…'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={matched}
          onValueChange={(v) => {
            setMatched(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Matched" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Matched + unmatched</SelectItem>
            <SelectItem value="true">Matched to a lead</SelectItem>
            <SelectItem value="false">Unmatched (needs review)</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={optedIn}
          onValueChange={(v) => {
            setOptedIn(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Opt-in status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Opted in + not</SelectItem>
            <SelectItem value="true">Opted in</SelectItem>
            <SelectItem value="false">Not opted in</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="pt-6 text-sm text-destructive">
            Failed to load WhatsApp messages: {error instanceof Error ? error.message : 'Unknown error'}
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {data && data.messages.length === 0 && (
        <p className="text-sm text-muted-foreground">No WhatsApp messages yet.</p>
      )}

      <div className="space-y-3">
        {data?.messages.map((message) => (
          <MessageCard key={message.id} message={message} />
        ))}
      </div>

      {data && data.messages.length > 0 && (
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
