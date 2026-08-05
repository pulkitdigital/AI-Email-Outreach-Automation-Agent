import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CategorizationRule } from '@bebeyond/shared';

vi.mock('../../../config/env.js', () => ({
  env: { AI_CATEGORIZATION_MIN_CONFIDENCE: 0.5 },
}));

const getLeadByIdMock = vi.fn();
const updateLeadCategorizationMock = vi.fn();
vi.mock('../../../db/repositories/leadsRepository.js', () => ({
  getLeadById: getLeadByIdMock,
  updateLeadCategorization: updateLeadCategorizationMock,
}));

const listActiveCategoriesMock = vi.fn();
vi.mock('../../../db/repositories/categoriesRepository.js', () => ({
  listActiveCategories: listActiveCategoriesMock,
}));

const listActiveCategorizationRulesMock = vi.fn();
vi.mock('../../../db/repositories/categorizationRulesRepository.js', () => ({
  listActiveCategorizationRules: listActiveCategorizationRulesMock,
}));

const replaceSecondaryCategoriesMock = vi.fn();
vi.mock('../../../db/repositories/leadCategoriesRepository.js', () => ({
  replaceSecondaryCategories: replaceSecondaryCategoriesMock,
}));

const categorizeLeadAiMock = vi.fn();
const classifyCategoryAiMock = vi.fn();
const getAIProviderMock = vi.fn(() => ({
  categorizeLead: categorizeLeadAiMock,
  classifyCategory: classifyCategoryAiMock,
}));
vi.mock('../../../providers/ai/index.js', () => ({
  getAIProvider: getAIProviderMock,
}));

// Deck generation (Phase 3) runs behind its own queue/worker — stub it here so these tests
// never touch a real DB/queue, and so the trigger-on-category-change behavior is assertable.
const triggerDeckGenerationMock = vi.fn();
vi.mock('../../deckGeneration/deckGenerationService.js', () => ({
  triggerDeckGeneration: triggerDeckGenerationMock,
}));

const {
  categorizeLead,
  markCategorizationFailed,
  classifyNewCategory,
  CategoryClassificationError,
  CategoryClassificationQuotaError,
} = await import('../categorizationService.js');
const { AIConfigError } = await import('../../../providers/ai/errors.js');

function baseLead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    industry: null,
    companyName: null,
    website: null,
    rawData: {},
    status: 'new',
    categoryId: null,
    ...overrides,
  };
}

const RESTAURANT_RULE: CategorizationRule = {
  id: 'r1',
  categoryId: 'cat-dm',
  matchField: 'industry',
  matchType: 'keyword',
  pattern: 'restaurant',
  weight: 0.6,
  isActive: true,
};

const WEAK_MARKETPLACE_RULE: CategorizationRule = {
  id: 'r2',
  categoryId: 'cat-marketplace',
  matchField: 'any',
  matchType: 'keyword',
  pattern: 'clothing',
  weight: 0.35,
  isActive: true,
};

beforeEach(() => {
  getLeadByIdMock.mockReset();
  updateLeadCategorizationMock.mockReset();
  listActiveCategoriesMock.mockReset();
  listActiveCategorizationRulesMock.mockReset();
  replaceSecondaryCategoriesMock.mockReset();
  categorizeLeadAiMock.mockReset();
  classifyCategoryAiMock.mockReset();
  getAIProviderMock.mockClear();
  triggerDeckGenerationMock.mockReset();
});

describe('categorizeLead', () => {
  it('pure rule match: a confident rule hit never calls the AI provider', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ industry: 'Restaurant' }));
    listActiveCategorizationRulesMock.mockResolvedValue([RESTAURANT_RULE]);

    await categorizeLead('lead-1');

    expect(categorizeLeadAiMock).not.toHaveBeenCalled();
    expect(updateLeadCategorizationMock).toHaveBeenCalledWith('lead-1', {
      categoryId: 'cat-dm',
      categorizationMethod: 'rule_based',
      categorizationConfidence: 0.6,
      status: 'categorized',
      reviewReason: null,
    });
    expect(replaceSecondaryCategoriesMock).toHaveBeenCalledWith('lead-1', []);
    expect(triggerDeckGenerationMock).toHaveBeenCalledWith('lead-1');
  });

  it('pure AI fallback: no rule match at all falls through to the AI provider', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ industry: 'Aerospace Engineering' }));
    listActiveCategorizationRulesMock.mockResolvedValue([RESTAURANT_RULE]);
    listActiveCategoriesMock.mockResolvedValue([
      { id: 'cat-dm', name: 'Digital Marketing', serviceGroup: 'digital_marketing' },
      { id: 'cat-web', name: 'Web & App Solutions', serviceGroup: 'web_app_solutions' },
    ]);
    categorizeLeadAiMock.mockResolvedValue({
      categoryId: 'cat-web',
      confidence: 0.8,
      secondaryCategoryIds: [],
      method: 'ai',
    });

    await categorizeLead('lead-1');

    expect(categorizeLeadAiMock).toHaveBeenCalledTimes(1);
    expect(updateLeadCategorizationMock).toHaveBeenCalledWith('lead-1', {
      categoryId: 'cat-web',
      categorizationMethod: 'ai',
      categorizationConfidence: 0.8,
      status: 'categorized',
      reviewReason: null,
    });
    expect(replaceSecondaryCategoriesMock).toHaveBeenCalledWith('lead-1', []);
  });

  it('boundary case: a partial (secondary-level) rule match still falls through to AI for the primary, and the rule-based secondary is merged with the AI result', async () => {
    getLeadByIdMock.mockResolvedValue(
      baseLead({
        rawData: { notes: 'We sell clothing online but are not sure what else we need' },
      }),
    );
    listActiveCategorizationRulesMock.mockResolvedValue([WEAK_MARKETPLACE_RULE]);
    listActiveCategoriesMock.mockResolvedValue([
      { id: 'cat-web', name: 'Web & App Solutions', serviceGroup: 'web_app_solutions' },
      { id: 'cat-creative', name: 'Creative Services', serviceGroup: 'creative_services' },
    ]);
    categorizeLeadAiMock.mockResolvedValue({
      categoryId: 'cat-web',
      confidence: 0.7,
      secondaryCategoryIds: ['cat-creative'],
      method: 'ai',
    });

    await categorizeLead('lead-1');

    expect(categorizeLeadAiMock).toHaveBeenCalledTimes(1);
    expect(updateLeadCategorizationMock).toHaveBeenCalledWith('lead-1', {
      categoryId: 'cat-web',
      categorizationMethod: 'ai',
      categorizationConfidence: 0.7,
      status: 'categorized',
      reviewReason: null,
    });
    // Rule-based secondary (cat-marketplace, 0.35) merged with the AI-reported secondary
    // (cat-creative, confidence approximated as the AI's own confidence), ranked by confidence.
    expect(replaceSecondaryCategoriesMock).toHaveBeenCalledWith('lead-1', [
      { categoryId: 'cat-creative', confidence: 0.7, method: 'ai' },
      { categoryId: 'cat-marketplace', confidence: 0.35, method: 'rule_based' },
    ]);
  });

  it('does not trigger deck generation when recategorizing confirms the same category', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ industry: 'Restaurant', categoryId: 'cat-dm' }));
    listActiveCategorizationRulesMock.mockResolvedValue([RESTAURANT_RULE]);

    await categorizeLead('lead-1');

    expect(triggerDeckGenerationMock).not.toHaveBeenCalled();
  });

  it('triggers deck generation when recategorizing changes the primary category', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ industry: 'Restaurant', categoryId: 'cat-old' }));
    listActiveCategorizationRulesMock.mockResolvedValue([RESTAURANT_RULE]);

    await categorizeLead('lead-1');

    expect(triggerDeckGenerationMock).toHaveBeenCalledWith('lead-1');
  });

  it('does not trigger deck generation when the outcome is needs_review', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead());
    listActiveCategorizationRulesMock.mockResolvedValue([]);
    listActiveCategoriesMock.mockResolvedValue([
      { id: 'cat-web', name: 'Web & App Solutions', serviceGroup: null },
    ]);
    categorizeLeadAiMock.mockResolvedValue({
      categoryId: 'cat-web',
      confidence: 0.3,
      secondaryCategoryIds: [],
    });

    await categorizeLead('lead-1');

    expect(triggerDeckGenerationMock).not.toHaveBeenCalled();
  });

  it('a deck-generation trigger failure does not fail categorization itself', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ industry: 'Restaurant' }));
    listActiveCategorizationRulesMock.mockResolvedValue([RESTAURANT_RULE]);
    triggerDeckGenerationMock.mockRejectedValue(new Error('queue unavailable'));

    await expect(categorizeLead('lead-1')).resolves.toBeUndefined();
    expect(updateLeadCategorizationMock).toHaveBeenCalled();
  });

  it('marks needs_review (not a guess) when the AI result is below the trust threshold', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead());
    listActiveCategorizationRulesMock.mockResolvedValue([]);
    listActiveCategoriesMock.mockResolvedValue([
      { id: 'cat-web', name: 'Web & App Solutions', serviceGroup: null },
    ]);
    categorizeLeadAiMock.mockResolvedValue({
      categoryId: 'cat-web',
      confidence: 0.3,
      secondaryCategoryIds: [],
    });

    await categorizeLead('lead-1');

    expect(updateLeadCategorizationMock).toHaveBeenCalledWith('lead-1', {
      categoryId: null,
      categorizationMethod: 'ai',
      categorizationConfidence: 0.3,
      status: 'needs_review',
      reviewReason: 'ai_categorization_low_confidence',
    });
  });

  it('lets an AI provider error propagate uncaught, so the caller (worker) can retry', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead());
    listActiveCategorizationRulesMock.mockResolvedValue([]);
    listActiveCategoriesMock.mockResolvedValue([]);
    categorizeLeadAiMock.mockRejectedValue(new Error('AI API timeout'));

    await expect(categorizeLead('lead-1')).rejects.toThrow('AI API timeout');
    expect(updateLeadCategorizationMock).not.toHaveBeenCalled();
  });

  it('does not advance status for a lead already past the pre-categorization stage', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ industry: 'Restaurant', status: 'in_sequence' }));
    listActiveCategorizationRulesMock.mockResolvedValue([RESTAURANT_RULE]);

    await categorizeLead('lead-1');

    expect(updateLeadCategorizationMock).toHaveBeenCalledWith(
      'lead-1',
      expect.objectContaining({ status: 'in_sequence' }),
    );
  });

  it('throws if the lead does not exist', async () => {
    getLeadByIdMock.mockResolvedValue(null);
    await expect(categorizeLead('missing-lead')).rejects.toThrow(/not found/);
  });
});

describe('markCategorizationFailed', () => {
  it('flags a pre-categorization lead as needs_review with the failure reason', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ status: 'new' }));

    await markCategorizationFailed('lead-1');

    expect(updateLeadCategorizationMock).toHaveBeenCalledWith('lead-1', {
      categoryId: null,
      categorizationMethod: null,
      categorizationConfidence: null,
      status: 'needs_review',
      reviewReason: 'ai_categorization_failed',
    });
  });

  it("leaves an already-progressed lead's status untouched", async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ status: 'in_sequence' }));

    await markCategorizationFailed('lead-1');

    expect(updateLeadCategorizationMock).toHaveBeenCalledWith(
      'lead-1',
      expect.objectContaining({ status: 'in_sequence' }),
    );
  });
});

const CLASSIFICATION_RESULT = {
  serviceGroup: 'digital_marketing' as const,
  rules: [
    { matchField: 'industry' as const, pattern: 'hotel', weight: 0.6 },
    { matchField: 'any' as const, pattern: 'hospitality', weight: 0.35 },
    { matchField: 'any' as const, pattern: 'resort', weight: 0.35 },
  ],
};

describe('classifyNewCategory', () => {
  it('returns the AI result on a clean first call', async () => {
    classifyCategoryAiMock.mockResolvedValue(CLASSIFICATION_RESULT);

    const result = await classifyNewCategory('Hospitality & Travel');

    expect(result).toEqual(CLASSIFICATION_RESULT);
    expect(classifyCategoryAiMock).toHaveBeenCalledTimes(1);
    expect(classifyCategoryAiMock).toHaveBeenCalledWith({ name: 'Hospitality & Travel' });
  });

  it('retries a transient failure and succeeds on a later attempt', async () => {
    classifyCategoryAiMock
      .mockRejectedValueOnce(new Error('malformed JSON'))
      .mockResolvedValueOnce(CLASSIFICATION_RESULT);

    const result = await classifyNewCategory('Hospitality & Travel');

    expect(result).toEqual(CLASSIFICATION_RESULT);
    expect(classifyCategoryAiMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after exhausting every attempt on persistent transient failures — never returns a guessed result', async () => {
    classifyCategoryAiMock.mockRejectedValue(new Error('AI API timeout'));

    await expect(classifyNewCategory('Hospitality & Travel')).rejects.toThrow(
      CategoryClassificationError,
    );
    // 3 attempts (CLASSIFY_CATEGORY_MAX_ATTEMPTS) — burns the whole budget on a transient error.
    expect(classifyCategoryAiMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a config error (bad/missing API key) — fails loudly on the first attempt', async () => {
    classifyCategoryAiMock.mockRejectedValue(new AIConfigError('GEMINI_API_KEY is not set'));

    await expect(classifyNewCategory('Hospitality & Travel')).rejects.toThrow(
      CategoryClassificationError,
    );
    expect(classifyCategoryAiMock).toHaveBeenCalledTimes(1);
  });

  it('throws CategoryClassificationQuotaError (a CategoryClassificationError subclass) when every attempt fails on a 429/quota error', async () => {
    classifyCategoryAiMock.mockRejectedValue(
      Object.assign(new Error('You exceeded your current quota'), { status: 429 }),
    );

    await expect(classifyNewCategory('Hospitality & Travel')).rejects.toThrow(
      CategoryClassificationQuotaError,
    );
    await expect(classifyNewCategory('Hospitality & Travel')).rejects.toThrow(
      CategoryClassificationError,
    );
    expect(classifyCategoryAiMock).toHaveBeenCalledTimes(6); // 3 attempts x 2 assertions above
  });

  it('throws the base (non-quota) error when attempts fail for an unrelated reason', async () => {
    classifyCategoryAiMock.mockRejectedValue(new Error('malformed JSON'));

    const err = await classifyNewCategory('Hospitality & Travel').catch((e) => e);
    expect(err).toBeInstanceOf(CategoryClassificationError);
    expect(err).not.toBeInstanceOf(CategoryClassificationQuotaError);
  });
});
