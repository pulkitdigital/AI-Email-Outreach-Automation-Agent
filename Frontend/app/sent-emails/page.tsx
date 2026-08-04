'use client';

import { useState } from 'react';
import { useCategories, useSentEmailLogs } from '@/lib/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/status-badge';
import { formatDateTime, titleCase } from '@/lib/format';

const STATUSES = [
  'queued',
  'sending',
  'sent',
  'delivered',
  'failed',
  'bounced',
  'opened',
  'cancelled',
];
const PROVIDERS = ['brevo', 'gmail'];
const STAGES = ['new', 'followup', 'final'];
const ALL = '__all__';
const PAGE_SIZE = 25;

export default function SentEmailsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ALL);
  const [providerName, setProviderName] = useState(ALL);
  const [stage, setStage] = useState(ALL);
  const [categoryId, setCategoryId] = useState(ALL);
  const [page, setPage] = useState(1);

  const { data: categories } = useCategories();
  const { data, isLoading, isError, error } = useSentEmailLogs({
    search: search || undefined,
    status: status === ALL ? undefined : status,
    providerName: providerName === ALL ? undefined : providerName,
    stage: stage === ALL ? undefined : stage,
    categoryId: categoryId === ALL ? undefined : categoryId,
    page,
    pageSize: PAGE_SIZE,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sent Email Log</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} send${data.total === 1 ? '' : 's'}` : 'Loading…'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Search email or company…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="max-w-64"
          />
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={providerName}
            onValueChange={(v) => {
              setProviderName(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All providers</SelectItem>
              {PROVIDERS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={stage}
            onValueChange={(v) => {
              setStage(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All stages</SelectItem>
              {STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={categoryId}
            onValueChange={(v) => {
              setCategoryId(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {categories?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {isError && (
            <p className="text-sm text-destructive">
              Failed to load sent emails: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          )}
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {data && data.logs.length === 0 && (
            <p className="text-sm text-muted-foreground">No sends match these filters.</p>
          )}
          {data && data.logs.length > 0 && (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <p className="font-medium">{log.companyName ?? log.leadEmail}</p>
                        <p className="text-xs text-muted-foreground">{log.leadEmail}</p>
                      </TableCell>
                      <TableCell>
                        {log.categoryName ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>{titleCase(log.sequenceStage)}</TableCell>
                      <TableCell>
                        <StatusBadge status={log.status} />
                        {log.errorMessage && (
                          <p
                            className="mt-1 max-w-56 truncate text-xs text-destructive"
                            title={log.errorMessage}
                          >
                            {log.errorMessage}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{log.providerName}</TableCell>
                      <TableCell className="max-w-56 truncate">{log.subject}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(log.sentAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-4 flex items-center justify-between">
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
