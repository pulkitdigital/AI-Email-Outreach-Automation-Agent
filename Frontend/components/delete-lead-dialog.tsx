'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDeleteLead } from '@/lib/hooks';
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

interface DeleteLeadDialogProps {
  leadId: string;
  leadLabel: string;
}

/**
 * Per-row "Delete" action on the Leads table. Permanently removes the lead (see
 * Backend/src/routes/leads.ts's DELETE /api/leads/:id and
 * Backend/src/modules/leads/leadDeletionService.ts) — irreversible, so the confirmation copy
 * says so explicitly rather than implying it's recoverable.
 */
export function DeleteLeadDialog({ leadId, leadLabel }: DeleteLeadDialogProps) {
  const [open, setOpen] = useState(false);
  const deleteLead = useDeleteLead();

  function handleDelete() {
    deleteLead.mutate(leadId, {
      onSuccess: () => {
        toast.success(`${leadLabel} permanently deleted`);
        setOpen(false);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to delete lead'),
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Delete ${leadLabel}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Trash2 />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Delete lead?</DialogTitle>
          <DialogDescription>
            Permanently delete {leadLabel} and all its email/sequence history. This cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleteLead.isPending}>
            {deleteLead.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
