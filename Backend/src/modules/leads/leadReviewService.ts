import {
  getLeadById,
  updateLeadFields,
  updateLeadStatus,
  type LeadRecord,
} from '../../db/repositories/leadsRepository.js';
import type { MergeableLeadFields } from '../ingestion/normalize.js';
import { enqueueCategorizationJob } from '../../queue/queues.js';
import { LeadReviewPreconditionError } from './errors.js';

/**
 * The dashboard's "needs review" queue action (Phase 6): apply any inline edits, then move the
 * lead out of needs_review and back into the normal pipeline by re-running categorization —
 * confirming a fixed-up lead's data isn't meaningfully different from asking to recategorize it,
 * so this reuses the same enqueueCategorizationJob entry point categorization.ts's own
 * recategorize endpoint uses. Only a lead actually in needs_review can be confirmed — confirming
 * an already-progressed lead would be a silent no-op at best and a confusing status regression
 * at worst, so it's rejected outright instead.
 */
export async function confirmLead(
  id: string,
  patch: Partial<MergeableLeadFields>,
): Promise<LeadRecord> {
  const lead = await getLeadById(id);
  if (!lead) {
    throw new Error(`Cannot confirm: lead not found (${id})`);
  }

  if (lead.status !== 'needs_review') {
    throw new LeadReviewPreconditionError(
      `Cannot confirm lead ${id}: status is '${lead.status}', not 'needs_review'`,
    );
  }

  await updateLeadFields(id, patch);
  const updated = await updateLeadStatus(id, 'new', null);
  await enqueueCategorizationJob({ leadId: id });

  return updated ?? lead;
}
