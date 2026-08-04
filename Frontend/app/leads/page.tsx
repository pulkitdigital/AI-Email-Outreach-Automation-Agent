'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useCategories, useLeads } from '@/lib/hooks';
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
import { formatDate } from '@/lib/format';
import type { LeadListItem } from '@/lib/types';

const STATUSES = [
  'new',
  'needs_review',
  'categorized',
  'deck_generated',
  'in_sequence',
  'completed',
  'replied',
  'bounced',
  'do_not_contact',
];

const SEQUENCE_STAGES = [
  'new',
  'followup',
  'final',
  'completed',
  'stopped_reply',
  'stopped_bounce',
  'stopped_unsubscribe',
  'stopped_manual',
];

const ALL = '__all__';

const columns: ColumnDef<LeadListItem>[] = [
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.companyName ?? row.original.email}</p>
        <p className="text-xs text-muted-foreground">{row.original.email}</p>
      </div>
    ),
  },
  {
    accessorKey: 'categoryName',
    header: 'Category',
    cell: ({ row }) =>
      row.original.categoryName ?? <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'sequenceStage',
    header: 'Sequence',
    cell: ({ row }) =>
      row.original.sequenceStage ? (
        <StatusBadge status={row.original.sequenceStage} />
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: 'createdAt',
    header: 'Ingested',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{formatDate(row.original.createdAt)}</span>
    ),
  },
];

export default function LeadsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ALL);
  const [categoryId, setCategoryId] = useState(ALL);
  const [sequenceStage, setSequenceStage] = useState(ALL);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const { data: categories } = useCategories();
  const { data, isLoading, isError, error } = useLeads({
    search: search || undefined,
    status: status === ALL ? undefined : status,
    categoryId: categoryId === ALL ? undefined : categoryId,
    sequenceStage: sequenceStage === ALL ? undefined : sequenceStage,
    page,
    pageSize,
  });

  const table = useReactTable({
    data: data?.leads ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} lead${data.total === 1 ? '' : 's'}` : 'Loading…'}
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
            <SelectTrigger className="w-44">
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
          <Select
            value={sequenceStage}
            onValueChange={(v) => {
              setSequenceStage(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Sequence stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All sequence stages</SelectItem>
              {SEQUENCE_STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
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
              Failed to load leads: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          )}
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {data && data.leads.length === 0 && (
            <p className="text-sm text-muted-foreground">No leads match these filters.</p>
          )}
          {data && data.leads.length > 0 && (
            <>
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id}>
                      {hg.headers.map((header) => (
                        <TableHead key={header.id}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/leads/${row.original.id}`)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
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
