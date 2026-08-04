import { env } from '../../config/env.js';
import {
  countIngestionJobsByStatus,
  listRecentIngestionJobs,
} from '../../db/repositories/ingestionJobsRepository.js';
import { listLeads } from '../../db/repositories/leadsRepository.js';
import { listFailedPitchDecks } from '../../db/repositories/pitchDecksRepository.js';
import { listSentEmailLogs } from '../../db/repositories/sentEmailsLogRepository.js';

const RECENT_ITEM_LIMIT = 10;

/**
 * Aggregates every "something failed and needs a human" signal already logged by the error
 * handling built into every prior phase (failed sends, failed deck generations, failed/partial
 * ingestions, needs_review leads) into one call — the dashboard's System Status view (Phase 6),
 * so the user never has to dig through server logs to know something needs attention. Each
 * source already tracks its own failures via its own status column; this module does not
 * introduce any new failure-tracking, only surfaces what already exists.
 */
export async function getSystemStatus() {
  const [failedSends, failedDecks, failedIngestionJobs, failedIngestionCount, needsReviewLeads] =
    await Promise.all([
      listSentEmailLogs({ status: 'failed' }, { limit: RECENT_ITEM_LIMIT, offset: 0 }),
      listFailedPitchDecks(RECENT_ITEM_LIMIT),
      listRecentIngestionJobs(RECENT_ITEM_LIMIT, ['failed', 'partial']),
      countIngestionJobsByStatus(['failed', 'partial']),
      listLeads({ status: 'needs_review' }, { limit: RECENT_ITEM_LIMIT, offset: 0 }),
    ]);

  return {
    emailProvider: env.EMAIL_PROVIDER,
    aiProvider: env.AI_PROVIDER,
    failedSends: { count: failedSends.total, recent: failedSends.logs },
    failedDecks: { count: failedDecks.total, recent: failedDecks.decks },
    failedIngestions: { count: failedIngestionCount, recent: failedIngestionJobs },
    needsReviewLeads: { count: needsReviewLeads.total, recent: needsReviewLeads.leads },
  };
}
