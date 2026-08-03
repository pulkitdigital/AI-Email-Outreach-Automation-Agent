import { describe, expect, it } from 'vitest';
import { parseCategorizationResponse } from '../categorizationResponse.js';

const CANDIDATE_IDS = new Set(['cat-a', 'cat-b', 'cat-c']);

describe('parseCategorizationResponse', () => {
  it('parses a well-formed response', () => {
    const result = parseCategorizationResponse(
      JSON.stringify({
        primaryCategoryId: 'cat-a',
        confidence: 0.85,
        secondaryCategoryIds: ['cat-b'],
      }),
      CANDIDATE_IDS,
    );

    expect(result).toEqual({
      categoryId: 'cat-a',
      confidence: 0.85,
      secondaryCategoryIds: ['cat-b'],
      method: 'ai',
    });
  });

  it("strips markdown code fences the model wasn't supposed to add", () => {
    const raw =
      '```json\n{"primaryCategoryId":"cat-a","confidence":0.6,"secondaryCategoryIds":[]}\n```';
    const result = parseCategorizationResponse(raw, CANDIDATE_IDS);
    expect(result.categoryId).toBe('cat-a');
  });

  it('accepts a null primaryCategoryId (model genuinely found no fit)', () => {
    const result = parseCategorizationResponse(
      JSON.stringify({ primaryCategoryId: null, confidence: 0.1 }),
      CANDIDATE_IDS,
    );
    expect(result.categoryId).toBeNull();
  });

  it('rejects malformed JSON', () => {
    expect(() => parseCategorizationResponse('not json at all', CANDIDATE_IDS)).toThrow(
      /not valid JSON/,
    );
  });

  it('rejects a response missing required fields', () => {
    expect(() =>
      parseCategorizationResponse(JSON.stringify({ confidence: 0.5 }), CANDIDATE_IDS),
    ).toThrow(/schema validation/);
  });

  it('rejects confidence outside 0-1', () => {
    expect(() =>
      parseCategorizationResponse(
        JSON.stringify({ primaryCategoryId: 'cat-a', confidence: 1.5 }),
        CANDIDATE_IDS,
      ),
    ).toThrow(/schema validation/);
  });

  it('rejects a hallucinated primaryCategoryId not in the candidate set', () => {
    expect(() =>
      parseCategorizationResponse(
        JSON.stringify({ primaryCategoryId: 'made-up-id', confidence: 0.9 }),
        CANDIDATE_IDS,
      ),
    ).toThrow(/unknown primaryCategoryId/);
  });

  it('silently drops hallucinated secondary ids and the primary id if duplicated, keeping only valid ones', () => {
    const result = parseCategorizationResponse(
      JSON.stringify({
        primaryCategoryId: 'cat-a',
        confidence: 0.9,
        secondaryCategoryIds: ['cat-b', 'made-up-id', 'cat-a'],
      }),
      CANDIDATE_IDS,
    );
    expect(result.secondaryCategoryIds).toEqual(['cat-b']);
  });
});
