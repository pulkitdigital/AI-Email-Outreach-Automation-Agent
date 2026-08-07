import type { ParsedLeadRow } from '@bebeyond/shared';
import {
  appendIngestionJobAlreadyContactedItem,
  incrementIngestionJobCounters,
} from '../../db/repositories/ingestionJobsRepository.js';
import { upsertLead } from '../../db/repositories/leadsRepository.js';
import { getContactedSummaryForLead } from '../../db/repositories/sentEmailsLogRepository.js';
import { enqueueCategorizationJob } from '../../queue/queues.js';
import { normalizeEmail } from './normalize.js';

/**
 * Writes one parsed row through the dedup-merge path and updates the owning ingestion job's
 * counters. A row with reviewReason set lands as a brand-new lead in status 'needs_review' —
 * never 'new' — so it can't be auto-promoted into the active pipeline. Merges into an existing
 * lead never change that lead's status/review_reason, regardless of the incoming row's own
 * confidence — only blank contact fields get filled in (see leadsRepository.upsertLead).
 *
 * A brand-new, confidently-ingested lead (status 'new') is automatically queued for
 * categorization here — "runs automatically right after a lead is confirmed in ingestion", per
 * Phase 2. needs_review leads and merges into existing leads are NOT auto-categorized; a
 * needs_review lead isn't "confirmed" yet, and a merge doesn't change what a lead already is.
 */
export async function writeLeadRow(
  jobId: string,
  sourceFile: string,
  row: ParsedLeadRow,
): Promise<void> {
  const emailNormalized = normalizeEmail(row.email);
  const status = row.reviewReason ? 'needs_review' : 'new';

  const { record, wasCreated, mergedFields, alreadyContacted } = await upsertLead({
    email: row.email.trim(),
    emailNormalized,
    companyName: row.companyName,
    contactName: row.contactName,
    phone: row.phone,
    website: row.website,
    industry: row.industry,
    country: row.country,
    region: row.region,
    ingestionJobId: jobId,
    sourceFile,
    rawData: row.rawData,
    status,
    reviewReason: row.reviewReason ?? null,
    extractionConfidence: row.extractionConfidence ?? null,
  });

  await incrementIngestionJobCounters(jobId, {
    totalLeadsCreated: wasCreated ? 1 : 0,
    totalLeadsMerged: !wasCreated && mergedFields.length > 0 ? 1 : 0,
    totalLeadsAlreadyContacted: alreadyContacted ? 1 : 0,
    totalRowsFlaggedForReview: wasCreated && status === 'needs_review' ? 1 : 0,
  });

  // A sub-classification of the "already exists" case above, not a separate bucket — this row
  // can be both "unchanged"/"merged" AND "already contacted" at the same time.
  if (alreadyContacted) {
    const summary = await getContactedSummaryForLead(record.id);
    await appendIngestionJobAlreadyContactedItem(jobId, {
      email: record.email,
      companyName: record.companyName,
      lastSentAt: summary.lastSentAt ? summary.lastSentAt.toISOString() : null,
      sentCount: summary.sentCount,
    });
  }

  if (wasCreated && status === 'new') {
    await enqueueCategorizationJob({ leadId: record.id });
  }
}
