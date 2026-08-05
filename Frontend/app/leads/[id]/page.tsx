'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  useLead,
  useUpdateLead,
  useConfirmLead,
  useRecategorizeLead,
  useRegenerateDeck,
  useSendNow,
  useCategories,
} from '@/lib/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
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
import { AddCategoryDialog } from '@/components/add-category-dialog';
import { EditEmailDialog } from '@/components/edit-email-dialog';
import { WhatsAppPanel } from '@/components/whatsapp-panel';
import { formatDateTime, titleCase } from '@/lib/format';
import { deckDownloadUrl } from '@/lib/api-client';

const EDITABLE_FIELDS = [
  { key: 'companyName', label: 'Company' },
  { key: 'contactName', label: 'Contact' },
  { key: 'phone', label: 'Phone' },
  { key: 'website', label: 'Website' },
  { key: 'industry', label: 'Industry' },
  { key: 'country', label: 'Country' },
  { key: 'region', label: 'Region' },
] as const;

const SEQUENCE_STEPS: { stage: 'new' | 'followup' | 'final'; label: string }[] = [
  { stage: 'new', label: 'New' },
  { stage: 'followup', label: 'Follow-up' },
  { stage: 'final', label: 'Final' },
];

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const leadId = params.id;

  const { data: lead, isLoading, isError, error } = useLead(leadId);
  const { data: categories } = useCategories();
  const updateLead = useUpdateLead(leadId);
  const confirmLead = useConfirmLead(leadId);
  const recategorize = useRecategorizeLead();
  const regenerateDeck = useRegenerateDeck();
  const sendNow = useSendNow();

  const [fields, setFields] = useState<Record<string, string>>({});
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');

  useEffect(() => {
    if (!lead) return;
    setFields(Object.fromEntries(EDITABLE_FIELDS.map((f) => [f.key, lead[f.key] ?? ''])));
    setSelectedCategoryId(lead.categoryId ?? '');
  }, [lead]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (isError || !lead) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="pt-6 text-sm text-destructive">
          Failed to load lead: {error instanceof Error ? error.message : 'Not found'}
        </CardContent>
      </Card>
    );
  }

  const patch: Record<string, string | null> = fields;

  function handleSave() {
    updateLead.mutate(patch, {
      onSuccess: () => toast.success('Lead updated'),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update lead'),
    });
  }

  function handleConfirm() {
    confirmLead.mutate(patch, {
      onSuccess: () => toast.success('Confirmed and re-queued for categorization'),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to confirm'),
    });
  }

  function handleSaveCategory() {
    if (!selectedCategoryId) {
      toast.error('Pick a category first');
      return;
    }
    updateLead.mutate(
      { categoryId: selectedCategoryId },
      {
        onSuccess: () => toast.success('Category assigned'),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : 'Failed to assign category'),
      },
    );
  }

  function handleRecategorize() {
    recategorize.mutate(leadId, {
      onSuccess: () => toast.success('Recategorization queued'),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to recategorize'),
    });
  }

  function handleRegenerateDeck() {
    regenerateDeck.mutate(leadId, {
      onSuccess: () => toast.success('Deck regeneration queued'),
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : 'Failed to regenerate deck'),
    });
  }

  function handleSendNow(stage: 'new' | 'followup' | 'final') {
    sendNow.mutate(
      { leadId, stage },
      {
        onSuccess: () => toast.success(`${titleCase(stage)} send queued`),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to queue send'),
      },
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {lead.companyName ?? lead.email}
          </h1>
          <p className="text-sm text-muted-foreground">{lead.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={lead.status} />
          {lead.category && <StatusBadge status={lead.category.slug} />}
        </div>
      </div>

      {lead.status === 'needs_review' && (
        <Card className="border-brand-orange/40">
          <CardHeader>
            <CardTitle className="text-base">Needs review</CardTitle>
            <CardDescription>
              {titleCase(lead.reviewReason)} — fix any fields below, then confirm to re-queue for
              categorization.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {EDITABLE_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={f.key}>{f.label}</Label>
                <Input
                  id={f.key}
                  value={fields[f.key] ?? ''}
                  onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="category">
              Category{lead.categorizationMethod ? ` (${titleCase(lead.categorizationMethod)})` : ''}
            </Label>
            <div className="flex gap-2">
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                <SelectTrigger id="category" className="w-64">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={handleSaveCategory}
                disabled={updateLead.isPending || selectedCategoryId === (lead.categoryId ?? '')}
              >
                {updateLead.isPending ? 'Saving…' : 'Save category'}
              </Button>
              <AddCategoryDialog />
            </div>
          </div>

          <div className="flex gap-2">
            {lead.status === 'needs_review' ? (
              <Button onClick={handleConfirm} disabled={confirmLead.isPending}>
                {confirmLead.isPending ? 'Confirming…' : 'Confirm & Re-queue'}
              </Button>
            ) : (
              <Button onClick={handleSave} disabled={updateLead.isPending}>
                {updateLead.isPending ? 'Saving…' : 'Save'}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleRecategorize}
              disabled={recategorize.isPending}
            >
              Recategorize
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sequence</CardTitle>
          <CardDescription>
            {lead.sequence
              ? `Current stage: ${titleCase(lead.sequence.currentStage)}`
              : 'No sequence started yet.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lead.sequence && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">New</p>
                <p className="text-sm font-medium">
                  {formatDateTime(lead.sequence.stageNewSentAt)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  Follow-up {lead.sequence.stageFollowupSentAt ? 'sent' : 'scheduled'}
                </p>
                <p className="text-sm font-medium">
                  {formatDateTime(
                    lead.sequence.stageFollowupSentAt ?? lead.sequence.stageFollowupScheduledAt,
                  )}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  Final {lead.sequence.stageFinalSentAt ? 'sent' : 'scheduled'}
                </p>
                <p className="text-sm font-medium">
                  {formatDateTime(
                    lead.sequence.stageFinalSentAt ?? lead.sequence.stageFinalScheduledAt,
                  )}
                </p>
              </div>
            </div>
          )}
          {lead.sequence?.stoppedReason && (
            <p className="text-sm text-muted-foreground">Stopped: {lead.sequence.stoppedReason}</p>
          )}

          <Separator />

          <div className="flex flex-wrap gap-2">
            {SEQUENCE_STEPS.map((step) => (
              <div key={step.stage} className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSendNow(step.stage)}
                  disabled={sendNow.isPending}
                >
                  Send {step.label} now
                </Button>
                <EditEmailDialog leadId={leadId} stage={step.stage} label={step.label} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <WhatsAppPanel lead={lead} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pitch deck</CardTitle>
          <CardDescription>
            {lead.latestDeck ? (
              <StatusBadge status={lead.latestDeck.generationStatus} />
            ) : (
              'No deck generated yet.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          {lead.latestDeck?.generationStatus === 'ready' && (
            <a href={deckDownloadUrl(lead.latestDeck.id)} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline">
                Download deck
              </Button>
            </a>
          )}
          {lead.latestDeck?.generationError && (
            <p className="text-sm text-destructive">{lead.latestDeck.generationError}</p>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleRegenerateDeck}
            disabled={regenerateDeck.isPending}
          >
            {regenerateDeck.isPending ? 'Queuing…' : 'Regenerate deck'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sent emails</CardTitle>
        </CardHeader>
        <CardContent>
          {lead.sentLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No emails sent yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lead.sentLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{titleCase(log.sequenceStage)}</TableCell>
                    <TableCell>
                      <StatusBadge status={log.status} />
                    </TableCell>
                    <TableCell className="max-w-64 truncate">{log.subject}</TableCell>
                    <TableCell>{log.providerName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(log.sentAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
