'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  useIngestionJobs,
  useLeads,
  useConfirmLead,
  useUploadIngestionFile,
  useSubmitDriveLink,
} from '@/lib/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/status-badge';
import { formatDateTime, titleCase } from '@/lib/format';
import type { AlreadyContactedItem, IngestionJobProgress, LeadListItem } from '@/lib/types';

function UploadCard() {
  const [file, setFile] = useState<File | null>(null);
  const upload = useUploadIngestionFile();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    upload.mutate(file, {
      onSuccess: ({ jobId }) => {
        toast.success(`Upload queued (job ${jobId.slice(0, 8)})`);
        setFile(null);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Upload failed'),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Upload a file</CardTitle>
        <CardDescription>ZIP, PDF, CSV, or XLSX — processed in the background.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="ingestion-file">File</Label>
            <Input
              id="ingestion-file"
              type="file"
              accept=".zip,.pdf,.csv,.xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button type="submit" disabled={!file || upload.isPending}>
            {upload.isPending ? 'Uploading…' : 'Upload'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function DriveLinkCard() {
  const [url, setUrl] = useState('');
  const submit = useSubmitDriveLink();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    submit.mutate(url.trim(), {
      onSuccess: ({ jobId }) => {
        toast.success(`Drive link queued (job ${jobId.slice(0, 8)})`);
        setUrl('');
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to submit link'),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Google Drive link</CardTitle>
        <CardDescription>
          A shared file or folder link — must be shared with our service account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="drive-url">Drive URL</Label>
            <Input
              id="drive-url"
              placeholder="https://drive.google.com/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={!url.trim() || submit.isPending}>
            {submit.isPending ? 'Submitting…' : 'Submit'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AlreadyContactedCell({ job }: { job: IngestionJobProgress }) {
  const count = job.totalLeadsAlreadyContacted;

  if (count === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="link" size="sm" className="h-auto p-0">
          {count} already contacted
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Already contacted</DialogTitle>
          <DialogDescription>
            These rows in <span className="font-medium">{job.sourceReference}</span> matched
            existing leads that have already been sent at least one email.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {job.alreadyContactedItems.map((item: AlreadyContactedItem, i: number) => (
            <div
              key={`${item.email}-${i}`}
              className="rounded-lg border p-3 text-sm"
            >
              <p className="font-medium">{item.companyName ?? item.email}</p>
              <p className="text-muted-foreground">{item.email}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Last sent {formatDateTime(item.lastSentAt)} · {item.sentCount}{' '}
                {item.sentCount === 1 ? 'email' : 'emails'} sent
              </p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function JobsTable() {
  const { data: jobs, isLoading, isError, error } = useIngestionJobs(50);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent ingestion jobs</CardTitle>
        <CardDescription>Updates automatically while a job is in progress.</CardDescription>
      </CardHeader>
      <CardContent>
        {isError && (
          <p className="text-sm text-destructive">
            Failed to load jobs: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        )}
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {jobs && jobs.length === 0 && (
          <p className="text-sm text-muted-foreground">No ingestion jobs yet.</p>
        )}
        {jobs && jobs.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Files</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="text-right">Created</TableHead>
                <TableHead className="text-right">Merged</TableHead>
                <TableHead className="text-right">Already Contacted</TableHead>
                <TableHead className="text-right">Review</TableHead>
                <TableHead className="text-right">Errors</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="max-w-48 truncate font-medium" title={job.sourceReference}>
                    {job.sourceReference}{' '}
                    <span className="text-muted-foreground">({job.sourceType})</span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={job.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {job.filesProcessed}/{job.totalFilesDiscovered}
                  </TableCell>
                  <TableCell className="text-right">{job.totalRowsFound}</TableCell>
                  <TableCell className="text-right">{job.totalLeadsCreated}</TableCell>
                  <TableCell className="text-right">{job.totalLeadsMerged}</TableCell>
                  <TableCell className="text-right">
                    <AlreadyContactedCell job={job} />
                  </TableCell>
                  <TableCell className="text-right">{job.totalRowsFlaggedForReview}</TableCell>
                  <TableCell className="text-right">{job.totalErrors}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTime(job.startedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

const EDITABLE_FIELDS = [
  { key: 'companyName', label: 'Company' },
  { key: 'contactName', label: 'Contact' },
  { key: 'phone', label: 'Phone' },
  { key: 'website', label: 'Website' },
  { key: 'industry', label: 'Industry' },
  { key: 'country', label: 'Country' },
  { key: 'region', label: 'Region' },
] as const;

function NeedsReviewRow({ lead }: { lead: LeadListItem }) {
  const [fields, setFields] = useState<Record<string, string>>(() =>
    Object.fromEntries(EDITABLE_FIELDS.map((f) => [f.key, lead[f.key] ?? ''])),
  );
  const confirm = useConfirmLead(lead.id);

  function handleConfirm() {
    confirm.mutate(fields, {
      onSuccess: () => toast.success(`${lead.email} confirmed and re-queued for categorization`),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to confirm'),
    });
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="font-medium">{lead.email}</p>
          <p className="text-xs text-muted-foreground">
            {titleCase(lead.reviewReason)} · extraction confidence{' '}
            {lead.extractionConfidence != null
              ? `${Math.round(lead.extractionConfidence * 100)}%`
              : '—'}
          </p>
        </div>
        <Button size="sm" onClick={handleConfirm} disabled={confirm.isPending}>
          {confirm.isPending ? 'Confirming…' : 'Confirm & Re-queue'}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {EDITABLE_FIELDS.map((f) => (
          <div key={f.key} className="space-y-1">
            <Label htmlFor={`${lead.id}-${f.key}`} className="text-xs text-muted-foreground">
              {f.label}
            </Label>
            <Input
              id={`${lead.id}-${f.key}`}
              value={fields[f.key]}
              onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="h-8"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function NeedsReviewQueue() {
  const { data, isLoading, isError, error } = useLeads({ status: 'needs_review', pageSize: 50 });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Needs review</CardTitle>
        <CardDescription>
          Low-confidence extractions — fix any fields, then confirm to re-queue for categorization.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isError && (
          <p className="text-sm text-destructive">
            Failed to load needs-review leads:{' '}
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        )}
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {data && data.leads.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing needs review right now.</p>
        )}
        {data?.leads.map((lead) => (
          <NeedsReviewRow key={lead.id} lead={lead} />
        ))}
      </CardContent>
    </Card>
  );
}

export default function IngestionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ingestion</h1>
        <p className="text-sm text-muted-foreground">
          Upload lead sources and review anything the pipeline couldn&apos;t confidently parse.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <UploadCard />
        <DriveLinkCard />
      </div>

      <JobsTable />
      <NeedsReviewQueue />
    </div>
  );
}
