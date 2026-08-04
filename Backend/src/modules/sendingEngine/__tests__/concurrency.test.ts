import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * This is the centerpiece test for the "never send to an address twice, even under concurrent
 * job execution" requirement. It cannot exercise real Postgres (no DB available in this
 * environment — see project notes), so `claimSendAttempt` is replaced with a hand-built,
 * mutex-backed fake that faithfully reproduces the SAME contract the real SQL implementation
 * relies on: an atomic "only one caller may ever transition (lead, stage) from absent/failed to
 * queued" operation, backed by genuine async interleaving (via setTimeout-based delays) rather
 * than relying on JS's single-threadedness to make the race trivially unobservable.
 *
 * What this proves: sendSequenceEmail() correctly treats a failed claim as "do not send" under
 * real concurrent execution, and the fake's own locking proves the *shape* of the atomic
 * claim/retry contract is sound. What it does NOT prove: that Postgres's unique constraint +
 * SELECT ... FOR UPDATE actually behaves this way in production — that's a well-documented DB
 * primitive being relied on, not independently re-verified here.
 */

interface FakeRow {
  id: string;
  status: 'queued' | 'sent' | 'failed';
  retryCount: number;
}

const store = new Map<string, FakeRow>();
const lockChains = new Map<string, Promise<unknown>>();
let idCounter = 0;

/** Per-key async mutex — simulates the row lock a real `SELECT ... FOR UPDATE` would hold. */
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prior = lockChains.get(key) ?? Promise.resolve();
  const runNow = prior.then(fn, fn);
  lockChains.set(
    key,
    runNow.catch(() => undefined),
  );
  return runNow;
}

function randomJitter(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
}

const claimSendAttemptMock = vi.fn(async (input: { leadId: string; stage: string }) => {
  const key = `${input.leadId}:${input.stage}`;
  return withLock(key, async () => {
    await randomJitter(); // widen the window so concurrent callers genuinely interleave here
    const existing = store.get(key);

    if (!existing) {
      const id = `log-${++idCounter}`;
      store.set(key, { id, status: 'queued', retryCount: 0 });
      return { id, isRetry: false };
    }

    if (existing.status !== 'failed') {
      return null; // already sent, or another attempt is currently in flight
    }

    existing.status = 'queued';
    existing.retryCount += 1;
    return { id: existing.id, isRetry: true };
  });
});

const markSendResultMock = vi.fn(async (id: string, patch: { status: 'sent' | 'failed' }) => {
  for (const row of store.values()) {
    if (row.id === id) row.status = patch.status;
  }
});

vi.mock('../../../db/repositories/sentEmailsLogRepository.js', () => ({
  claimSendAttempt: claimSendAttemptMock,
  markSendResult: markSendResultMock,
  findCrossLeadSendCollision: vi.fn(async () => null),
}));

const leadRecord = {
  id: 'lead-1',
  email: 'lead1@example.com',
  emailNormalized: 'lead1@example.com',
  companyName: 'Acme Co',
  contactName: null,
  industry: null,
  categoryId: 'cat-1',
  status: 'deck_generated', // Phase 5: 'new' now requires a ready deck, not just 'categorized'
};
vi.mock('../../../db/repositories/leadsRepository.js', () => ({
  getLeadById: vi.fn(async () => leadRecord),
  updateLeadStatus: vi.fn(async () => leadRecord),
}));

vi.mock('../../../db/repositories/categoriesRepository.js', () => ({
  getCategoryById: vi.fn(async () => ({
    id: 'cat-1',
    name: 'Digital Marketing',
    slug: 'digital-marketing',
    serviceGroup: 'digital_marketing',
  })),
}));

vi.mock('../../../db/repositories/pitchDecksRepository.js', () => ({
  getLatestPitchDeckForLead: vi.fn(async () => ({
    id: 'deck-1',
    leadId: 'lead-1',
    generationStatus: 'ready',
    fileKey: 'pitch-decks/lead-1/deck-1.pptx',
    fileUrl: null,
<<<<<<< HEAD
    pdfFileKey: 'pitch-decks/lead-1/deck-1.pdf',
    pdfFileUrl: null,
=======
>>>>>>> 8e37ccd7b7ac19849c4ba3b08a803cc49cbe28f7
  })),
}));

vi.mock('../../../storage/index.js', () => ({
  getStorageProvider: () => ({ getObject: vi.fn(async () => Buffer.from('fake-pptx-bytes')) }),
}));

vi.mock('../../../db/repositories/dailySummaryRepository.js', () => ({
  getTodayRunDate: vi.fn(() => '2026-07-31'),
  incrementSentCount: vi.fn(async () => {}),
  incrementFailedCount: vi.fn(async () => {}),
  incrementCancelledCount: vi.fn(async () => {}),
}));

const sequenceRecord = { id: 'seq-1', leadId: 'lead-1' };
vi.mock('../../../db/repositories/emailSequencesRepository.js', () => ({
  getSequenceForLead: vi.fn(async () => sequenceRecord),
  getOrCreateSequenceForLead: vi.fn(async () => sequenceRecord),
  markStageSent: vi.fn(async () => {}),
}));

vi.mock('../../emailComposer/composerService.js', () => ({
  composeEmail: vi.fn(async () => ({
    subject: 'Test subject',
    html: '<p>hi</p>',
    text: 'hi',
    usedAiCopy: false,
  })),
}));

vi.mock('../../emailComposer/unsubscribeToken.js', () => ({
  buildUnsubscribeUrl: vi.fn(() => 'https://example.com/unsubscribe/lead-1/token'),
}));

const providerSendEmailMock = vi.fn(async () => {
  // Artificial delay widens the "in-flight" window so concurrent callers are actually likely to
  // observe the claimed-but-not-yet-resolved state, rather than the test passing by luck.
  await new Promise((resolve) => setTimeout(resolve, 15));
  return { externalMessageId: 'ext-msg-1', providerName: 'brevo' as const, sentAt: new Date() };
});
vi.mock('../../../providers/email/index.js', () => ({
  getEmailProvider: () => ({ getProviderName: () => 'brevo', sendEmail: providerSendEmailMock }),
}));

const { sendSequenceEmail } = await import('../sendingService.js');

beforeEach(() => {
  store.clear();
  lockChains.clear();
  idCounter = 0;
  claimSendAttemptMock.mockClear();
  markSendResultMock.mockClear();
  providerSendEmailMock.mockClear();
});

describe('sendSequenceEmail — concurrency safety', () => {
  it('sends exactly once even when the same (lead, stage) is attempted by many concurrent callers', async () => {
    const CONCURRENCY = 25;

    const outcomes = await Promise.allSettled(
      Array.from({ length: CONCURRENCY }, () => sendSequenceEmail('lead-1', 'new')),
    );

    expect(outcomes.every((o) => o.status === 'fulfilled')).toBe(true);
    expect(providerSendEmailMock).toHaveBeenCalledTimes(1);
    expect(claimSendAttemptMock).toHaveBeenCalledTimes(CONCURRENCY);
  });

  it('allows a legitimate retry after a failure, but a concurrent retry wave still only ever sends once', async () => {
    providerSendEmailMock.mockRejectedValueOnce(new Error('transient network error'));
    await expect(sendSequenceEmail('lead-1', 'new')).rejects.toThrow('transient network error');

    providerSendEmailMock.mockClear();

    const CONCURRENCY = 10;
    const outcomes = await Promise.allSettled(
      Array.from({ length: CONCURRENCY }, () => sendSequenceEmail('lead-1', 'new')),
    );

    expect(outcomes.every((o) => o.status === 'fulfilled')).toBe(true);
    expect(providerSendEmailMock).toHaveBeenCalledTimes(1);
  });
});
