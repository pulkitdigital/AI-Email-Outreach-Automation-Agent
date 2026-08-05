'use client';

import { toast } from 'sonner';
import { useCategories, useUpdateLead } from '@/lib/hooks';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface LeadCategorySelectProps {
  leadId: string;
  categoryId: string | null;
}

/**
 * Editable category dropdown for the Leads table. Options come from useCategories(), the same
 * cached query AddCategoryDialog invalidates on creation (Frontend/lib/hooks.ts's
 * useCreateCategory) — so a category created moments ago is already a selectable option here,
 * never a stale/missing list. On change, persists via useUpdateLead (PATCH /api/leads/:id ->
 * assignCategoryManually), and relies on that mutation's onSuccess invalidating
 * ['lead', id]/['leads'] to refetch the real persisted value — this component's displayed value
 * is the `categoryId` prop straight from that server data, not local optimistic state, so a
 * failed/blocked write never silently "looks saved" and then reverts.
 *
 * There's currently no backend support for clearing a lead's category (PATCH /api/leads/:id
 * rejects an empty categoryId — see Backend/src/routes/leads.ts), so this only offers assignment/
 * reassignment among existing categories, matching the lead detail page's own category Select.
 */
export function LeadCategorySelect({ leadId, categoryId }: LeadCategorySelectProps) {
  const { data: categories, isLoading } = useCategories();
  const updateLead = useUpdateLead(leadId);

  return (
    <Select
      value={categoryId ?? ''}
      onValueChange={(next) => {
        if (!next || next === categoryId) return;
        updateLead.mutate(
          { categoryId: next },
          {
            onSuccess: () => {
              const name = categories?.find((c) => c.id === next)?.name ?? 'category';
              toast.success(`Category updated to ${name}`);
            },
            onError: (err) =>
              toast.error(err instanceof Error ? err.message : 'Failed to update category'),
          },
        );
      }}
      disabled={updateLead.isPending || isLoading}
    >
      <SelectTrigger size="sm" className="w-44" onClick={(e) => e.stopPropagation()}>
        <SelectValue placeholder="Unassigned" />
      </SelectTrigger>
      <SelectContent onClick={(e) => e.stopPropagation()}>
        {categories?.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
