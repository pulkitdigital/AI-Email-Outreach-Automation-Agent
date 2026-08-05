'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { usePreviewSend, useSendNow } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
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

interface EditEmailDialogProps {
  leadId: string;
  stage: 'new' | 'followup' | 'final';
  label: string;
}

/**
 * "Edit before sending" (Feature B): loads the subject/body a real send would currently compose
 * (GET .../preview — read-only, doesn't claim a send slot), lets the user edit it, and sends
 * that exact edited content via sendNow's override instead of the AI/fallback-generated copy.
 * The edit is one-time — nothing about the template or future sends changes.
 */
export function EditEmailDialog({ leadId, stage, label }: EditEmailDialogProps) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const preview = usePreviewSend();
  const sendNow = useSendNow();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      preview.mutate(
        { leadId, stage },
        {
          onSuccess: (data) => {
            setSubject(data.subject);
            setBody(data.body);
          },
          onError: (err) =>
            toast.error(err instanceof Error ? err.message : 'Failed to load email preview'),
        },
      );
    } else {
      preview.reset();
      setSubject('');
      setBody('');
    }
  }

  function handleSaveAndSend() {
    if (!subject.trim() || !body.trim()) {
      toast.error('Subject and body cannot be empty');
      return;
    }
    sendNow.mutate(
      { leadId, stage, override: { composedSubject: subject, composedBody: body } },
      {
        onSuccess: () => {
          toast.success(`${label} send queued with edited content`);
          handleOpenChange(false);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to queue send'),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`Edit ${label} email before sending`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit {label.toLowerCase()} email</DialogTitle>
          <DialogDescription>
            This is exactly what would be sent right now. Edit it freely — the change applies
            only to this one send, not to future emails.
          </DialogDescription>
        </DialogHeader>

        {preview.isPending && <p className="text-sm text-muted-foreground">Loading preview…</p>}

        {preview.isError && (
          <p className="text-sm text-destructive">
            {preview.error instanceof Error ? preview.error.message : 'Failed to load preview'}
          </p>
        )}

        {preview.isSuccess && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-email-subject">Subject</Label>
              <Input
                id="edit-email-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-email-body">Body</Label>
              <Textarea
                id="edit-email-body"
                className="min-h-64 font-mono text-xs"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveAndSend}
            disabled={!preview.isSuccess || sendNow.isPending}
          >
            {sendNow.isPending ? 'Sending…' : 'Save & Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
