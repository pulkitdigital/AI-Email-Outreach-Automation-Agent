import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression test for the "category dropdown reverts to blank" bug report: create a category,
 * assign it to a lead, then re-list leads and confirm the assignment actually stuck. Unlike
 * categorizationService.test.ts (which mocks leadsRepository/categoriesRepository entirely to
 * unit-test categorizeLead's branching logic), this test mocks only the Postgres driver
 * (pool.js) and exercises the REAL createCategory / assignCategoryManually / listLeads
 * functions together — the same boundary leadsRepository.test.ts uses — so it actually proves
 * the write (assignCategoryManually -> updateLeadCategorization) and the read (listLeads' join
 * on categories) agree with each other, which is exactly where a real persistence/staleness bug
 * would show up and a fully-mocked unit test would not catch.
 */

const poolQueryMock = vi.fn();
vi.mock('../../../db/pool.js', () => ({
  pool: { query: poolQueryMock },
}));

// assignCategoryManually triggers deck generation as a side effect of a category change — that
// runs behind its own queue/worker (real BullMQ/Redis), irrelevant to this test, so it's stubbed
// exactly as categorizationService.test.ts already does.
const triggerDeckGenerationMock = vi.fn();
vi.mock('../../deckGeneration/deckGenerationService.js', () => ({
  triggerDeckGeneration: triggerDeckGenerationMock,
}));

const { createCategory } = await import('../../../db/repositories/categoriesRepository.js');
const { assignCategoryManually } = await import('../categorizationService.js');
const { listLeads } = await import('../../../db/repositories/leadsRepository.js');

const CATEGORY_ID = 'cat-travels';
const LEAD_ID = 'lead-eventcrafter';

function categoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CATEGORY_ID,
    name: 'Travels',
    slug: 'travels',
    serviceGroup: null,
    needsReview: true,
    reviewReason: 'ai_classification_quota_exceeded',
    ...overrides,
  };
}

function leadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LEAD_ID,
    email: 'eventcrafter.demo@gmail.com',
    emailNormalized: 'eventcrafter.demo@gmail.com',
    companyName: 'EventCrafter',
    contactName: 'Pooja Sharma',
    phone: null,
    website: null,
    industry: 'Event Management',
    country: null,
    region: null,
    ingestionJobId: null,
    sourceFile: null,
    categoryId: null,
    categorizationMethod: null,
    categorizationConfidence: null,
    status: 'new',
    statusManuallySet: false,
    reviewReason: null,
    extractionConfidence: null,
    rawData: {},
    deletedAt: null,
    createdAt: new Date('2026-08-04'),
    updatedAt: new Date('2026-08-04'),
    ...overrides,
  };
}

describe('create category -> assign to lead -> reload leads list', () => {
  beforeEach(() => {
    poolQueryMock.mockReset();
    triggerDeckGenerationMock.mockReset();
  });

  it('an assigned category is still present after re-listing leads', async () => {
    // 1. Create the category (mirrors the "Travels" category created via the Add Category dialog).
    poolQueryMock.mockResolvedValueOnce({ rows: [categoryRow()] });
    const category = await createCategory({
      name: 'Travels',
      slug: 'travels',
      serviceGroup: null,
      needsReview: true,
      reviewReason: 'ai_classification_quota_exceeded',
    });
    expect(category.id).toBe(CATEGORY_ID);

    // 2. Assign it to a lead (mirrors selecting it in the leads table's category dropdown).
    poolQueryMock
      .mockResolvedValueOnce({ rows: [leadRow()] }) // getLeadById
      .mockResolvedValueOnce({ rows: [categoryRow()] }) // getCategoryById
      .mockResolvedValueOnce({
        rows: [leadRow({ categoryId: category.id, categorizationMethod: 'manual', status: 'categorized' })],
      }); // updateLeadCategorization

    await assignCategoryManually(LEAD_ID, category.id);

    const updateCall = poolQueryMock.mock.calls[3]!;
    expect(updateCall[0]).toContain('UPDATE leads SET');
    expect(updateCall[1]).toEqual([LEAD_ID, category.id, 'manual', null, 'categorized', null]);

    // 3. Reload the leads list (mirrors navigating away and back, or a hard refresh) — the
    //    assignment must still be there, not reverted to unassigned.
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        {
          ...leadRow({ categoryId: category.id, categorizationMethod: 'manual', status: 'categorized' }),
          categoryName: category.name,
          sequenceStage: null,
          totalCount: '1',
        },
      ],
    });

    const { leads } = await listLeads({}, { limit: 25, offset: 0 });

    expect(leads).toHaveLength(1);
    expect(leads[0]!.categoryId).toBe(category.id);
    expect(leads[0]!.categoryName).toBe('Travels');
  });

  it('rejects assignment to a category id that does not exist, without corrupting the lead', async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [leadRow()] }) // getLeadById
      .mockResolvedValueOnce({ rows: [] }); // getCategoryById -> not found

    await expect(assignCategoryManually(LEAD_ID, 'nonexistent-category')).rejects.toThrow(
      /Category not found/,
    );

    // Only the two lookups happened — no UPDATE was ever issued for the bad id.
    expect(poolQueryMock).toHaveBeenCalledTimes(2);
  });
});
