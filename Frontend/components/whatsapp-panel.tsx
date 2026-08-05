'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useOptInLeadForWhatsApp, useSendWhatsAppMessage, useWhatsAppTemplates } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusBadge } from '@/components/status-badge';
import { formatDateTime, titleCase } from '@/lib/format';
import type { LeadDetail } from '@/lib/types';

const FREEFORM_WINDOW_MS = 24 * 60 * 60 * 1000;

function MarkOptedInDialog({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const optIn = useOptInLeadForWhatsApp(leadId);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setPhoneNumber('');
  }

  function handleSubmit() {
    if (!phoneNumber.trim()) {
      toast.error('Phone number is required');
      return;
    }
    optIn.mutate(
      { phoneNumber: phoneNumber.trim(), source: 'reply_offer' },
      {
        onSuccess: () => {
          toast.success('Lead marked as opted in for WhatsApp');
          handleOpenChange(false);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to record opt-in'),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Mark as opted in
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark as opted in</DialogTitle>
          <DialogDescription>
            For the reply-based path: the lead shared consent to be contacted on WhatsApp via an
            email reply, and you're recording the number they gave.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="whatsapp-number">Phone number</Label>
          <Input
            id="whatsapp-number"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="e.g. 919876543210"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={optIn.isPending}>
            {optIn.isPending ? 'Saving…' : 'Confirm opt-in'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FreeformSendBox({ leadId }: { leadId: string }) {
  const [body, setBody] = useState('');
  const send = useSendWhatsAppMessage(leadId);

  function handleSend() {
    if (!body.trim()) {
      toast.error('Message body is required');
      return;
    }
    send.mutate(
      { type: 'freeform', body: body.trim() },
      {
        onSuccess: () => {
          toast.success('WhatsApp message sent');
          setBody('');
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to send message'),
      },
    );
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Type a message…"
        className="min-h-24"
      />
      <Button size="sm" onClick={handleSend} disabled={send.isPending}>
        {send.isPending ? 'Sending…' : 'Send'}
      </Button>
    </div>
  );
}

function TemplateSendBox({ leadId }: { leadId: string }) {
  const { data: templates, isLoading } = useWhatsAppTemplates('approved');
  const [templateId, setTemplateId] = useState('');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const send = useSendWhatsAppMessage(leadId);

  const selectedTemplate = templates?.find((t) => t.id === templateId);
  const variableNames = useMemo(() => {
    const raw = selectedTemplate?.variables;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((v) => (v && typeof v === 'object' && 'name' in v ? String((v as { name: unknown }).name) : null))
      .filter((v): v is string => !!v);
  }, [selectedTemplate]);

  function handleSend() {
    if (!selectedTemplate) {
      toast.error('Pick a template first');
      return;
    }
    send.mutate(
      {
        type: 'template',
        templateName: selectedTemplate.name,
        language: selectedTemplate.language,
        variables: variableValues,
      },
      {
        onSuccess: () => {
          toast.success('WhatsApp template message sent');
          setVariableValues({});
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to send message'),
      },
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Outside the 24h reply window — only pre-approved templates can be sent.
      </p>
      <Select value={templateId} onValueChange={setTemplateId}>
        <SelectTrigger className="w-64">
          <SelectValue placeholder={isLoading ? 'Loading…' : 'Select a template'} />
        </SelectTrigger>
        <SelectContent>
          {templates?.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name} ({t.language})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {variableNames.map((name) => (
        <div key={name} className="space-y-1.5">
          <Label htmlFor={`var-${name}`}>{name}</Label>
          <Input
            id={`var-${name}`}
            value={variableValues[name] ?? ''}
            onChange={(e) => setVariableValues((prev) => ({ ...prev, [name]: e.target.value }))}
          />
        </div>
      ))}

      {templates && templates.length === 0 && !isLoading && (
        <p className="text-sm text-muted-foreground">No approved templates yet.</p>
      )}

      <Button size="sm" onClick={handleSend} disabled={send.isPending || !selectedTemplate}>
        {send.isPending ? 'Sending…' : 'Send template'}
      </Button>
    </div>
  );
}

/** Lead detail page's WhatsApp section (Phase 7 channel infrastructure) — opt-in status/source, a manual opt-in action for the reply-based path, and a send box that's freeform inside the 24h window or template-only outside it. */
export function WhatsAppPanel({ lead }: { lead: LeadDetail }) {
  const isWithinWindow =
    !!lead.whatsappLastInboundAt &&
    Date.now() - new Date(lead.whatsappLastInboundAt).getTime() < FREEFORM_WINDOW_MS;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">WhatsApp</CardTitle>
        <CardDescription>
          {lead.whatsappOptedIn ? (
            <>
              Opted in
              {lead.whatsappOptInSource ? ` via ${titleCase(lead.whatsappOptInSource)}` : ''}
              {lead.whatsappOptInAt ? ` on ${formatDateTime(lead.whatsappOptInAt)}` : ''}
              {lead.whatsappNumber ? ` — ${lead.whatsappNumber}` : ''}
            </>
          ) : (
            'Not opted in — outbound WhatsApp messages are blocked until this lead opts in.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <StatusBadge status={lead.whatsappOptedIn ? 'opted_in' : 'not_opted_in'} />
          {lead.whatsappOptedIn && (
            <StatusBadge status={isWithinWindow ? 'within_24h_window' : 'outside_24h_window'} />
          )}
          {!lead.whatsappOptedIn && <MarkOptedInDialog leadId={lead.id} />}
        </div>

        {lead.whatsappOptedIn &&
          (isWithinWindow ? <FreeformSendBox leadId={lead.id} /> : <TemplateSendBox leadId={lead.id} />)}
      </CardContent>
    </Card>
  );
}
