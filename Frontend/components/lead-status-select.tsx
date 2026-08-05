'use client';

import { toast } from 'sonner';
import { useUpdateLeadStatus } from '@/lib/hooks';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { titleCase } from '@/lib/format';
import type { LeadStatus } from '@bebeyond/shared';

/**
 * The human-settable statuses (Task requirement's confirmed enum). Automation-only pipeline
 * states ('deck_generated', 'completed', 'do_not_contact') are deliberately not offered here —
 * they're intermediate/derived states a person shouldn't hand-set — but are still included so
 * the dropdown can render a lead currently sitting in one of them without breaking.
 */
const MANUAL_STATUSES: LeadStatus[] = [
  'new',
  'needs_review',
  'categorized',
  'in_sequence',
  'contacted',
  'replied',
  'converted',
  'not_interested',
  'unsubscribed',
  'bounced',
];

const AUTOMATION_ONLY_STATUSES: LeadStatus[] = ['deck_generated', 'completed', 'do_not_contact'];

interface LeadStatusSelectProps {
  leadId: string;
  status: LeadStatus;
}

/** Editable status dropdown for the Leads table — replaces the static StatusBadge, saving on change. */
export function LeadStatusSelect({ leadId, status }: LeadStatusSelectProps) {
  const updateStatus = useUpdateLeadStatus();
  const options = MANUAL_STATUSES.includes(status)
    ? MANUAL_STATUSES
    : [status, ...MANUAL_STATUSES];

  return (
    <Select
      value={status}
      onValueChange={(next) => {
        if (next === status) return;
        updateStatus.mutate(
          { id: leadId, status: next },
          {
            onSuccess: () => toast.success(`Status updated to ${titleCase(next)}`),
            onError: (err) =>
              toast.error(err instanceof Error ? err.message : 'Failed to update status'),
          },
        );
      }}
      disabled={updateStatus.isPending}
    >
      <SelectTrigger
        size="sm"
        className="w-40"
        onClick={(e) => e.stopPropagation()}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent onClick={(e) => e.stopPropagation()}>
        {options.map((s) => (
          <SelectItem key={s} value={s}>
            {titleCase(s)}
            {AUTOMATION_ONLY_STATUSES.includes(s) ? ' (automated)' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
