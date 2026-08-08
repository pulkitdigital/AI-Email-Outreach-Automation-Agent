import { describe, expect, it, vi } from 'vitest';
import { parseCategorizationResponse } from '../categorizationResponse.js';

const CANDIDATES = [
  { id: 'cat-a', serviceGroup: 'digital_marketing' },
  { id: 'cat-b', serviceGroup: 'web_app_solutions' },
  { id: 'cat-c', serviceGroup: 'creative_services' },
];

describe('parseCategorizationResponse', () => {
  it('parses a well-formed response', () => {
    const result = parseCategorizationResponse(
      JSON.stringify({
        primaryCategoryId: 'cat-a',
        confidence: 0.85,
        secondaryCategoryIds: ['cat-b'],
      }),
      CANDIDATES,
    );

    expect(result).toEqual({
      categoryId: 'cat-a',
      confidence: 0.85,
      secondaryCategoryIds: ['cat-b'],
      method: 'ai',
      suggestedNewCategory: null,
    });
  });

  it("strips markdown code fences the model wasn't supposed to add", () => {
    const raw =
      '```json\n{"primaryCategoryId":"cat-a","confidence":0.6,"secondaryCategoryIds":[]}\n```';
    const result = parseCategorizationResponse(raw, CANDIDATES);
    expect(result.categoryId).toBe('cat-a');
  });

  it('accepts a null primaryCategoryId (model genuinely found no fit)', () => {
    const result = parseCategorizationResponse(
      JSON.stringify({ primaryCategoryId: null, confidence: 0.1 }),
      CANDIDATES,
    );
    expect(result.categoryId).toBeNull();
  });

  it('rejects malformed JSON', () => {
    expect(() => parseCategorizationResponse('not json at all', CANDIDATES)).toThrow(
      /not valid JSON/,
    );
  });

  it('rejects a response missing required fields', () => {
    expect(() =>
      parseCategorizationResponse(JSON.stringify({ confidence: 0.5 }), CANDIDATES),
    ).toThrow(/schema validation/);
  });

  it('rejects confidence outside 0-1', () => {
    expect(() =>
      parseCategorizationResponse(
        JSON.stringify({ primaryCategoryId: 'cat-a', confidence: 1.5 }),
        CANDIDATES,
      ),
    ).toThrow(/schema validation/);
  });

  it('rejects a hallucinated primaryCategoryId not in the candidate set', () => {
    expect(() =>
      parseCategorizationResponse(
        JSON.stringify({ primaryCategoryId: 'made-up-id', confidence: 0.9 }),
        CANDIDATES,
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
      CANDIDATES,
    );
    expect(result.secondaryCategoryIds).toEqual(['cat-b']);
  });

  describe('serviceGroup fallback (auto-correcting a mis-returned slug)', () => {
    it('auto-corrects a primaryCategoryId that is actually a candidate\'s serviceGroup, and warns', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = parseCategorizationResponse(
        JSON.stringify({ primaryCategoryId: 'web_app_solutions', confidence: 0.8 }),
        CANDIDATES,
      );

      expect(result.categoryId).toBe('cat-b');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('auto-corrected'));
      warnSpy.mockRestore();
    });

    it('is not specific to web_app_solutions — the fallback matches ANY candidate serviceGroup', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = parseCategorizationResponse(
        JSON.stringify({ primaryCategoryId: 'creative_services', confidence: 0.8 }),
        CANDIDATES,
      );

      expect(result.categoryId).toBe('cat-c');
      warnSpy.mockRestore();
    });

    it('still rejects a value matching neither an id nor any serviceGroup', () => {
      expect(() =>
        parseCategorizationResponse(
          JSON.stringify({ primaryCategoryId: 'totally_made_up', confidence: 0.8 }),
          CANDIDATES,
        ),
      ).toThrow(/unknown primaryCategoryId/);
    });

    it('applies the same fallback to secondaryCategoryIds', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = parseCategorizationResponse(
        JSON.stringify({
          primaryCategoryId: 'cat-a',
          confidence: 0.8,
          secondaryCategoryIds: ['web_app_solutions'],
        }),
        CANDIDATES,
      );

      expect(result.secondaryCategoryIds).toEqual(['cat-b']);
      warnSpy.mockRestore();
    });
  });

  describe('suggestedNewCategory', () => {
    it('parses a well-formed suggestion when primaryCategoryId is null', () => {
      const result = parseCategorizationResponse(
        JSON.stringify({
          primaryCategoryId: null,
          confidence: 0.2,
          suggestedNewCategory: {
            name: 'Home Renovation',
            slug: 'home-renovation',
            serviceGroup: 'home_renovation',
          },
        }),
        CANDIDATES,
      );
      expect(result.suggestedNewCategory).toEqual({
        name: 'Home Renovation',
        slug: 'home-renovation',
        serviceGroup: 'home_renovation',
      });
    });

    it('defaults to null when the field is omitted entirely (backward compatible with the pre-Phase-3 response shape)', () => {
      const result = parseCategorizationResponse(
        JSON.stringify({ primaryCategoryId: null, confidence: 0.1 }),
        CANDIDATES,
      );
      expect(result.suggestedNewCategory).toBeNull();
    });

    it('ignores a suggestion the model sent alongside a non-null primaryCategoryId (prompt says this should never happen, but never trust it blindly)', () => {
      const result = parseCategorizationResponse(
        JSON.stringify({
          primaryCategoryId: 'cat-a',
          confidence: 0.9,
          suggestedNewCategory: { name: 'X', slug: 'x', serviceGroup: 'x' },
        }),
        CANDIDATES,
      );
      expect(result.suggestedNewCategory).toBeNull();
    });

    it('drops a malformed suggestion (non-kebab-case slug) rather than failing the whole response', () => {
      const result = parseCategorizationResponse(
        JSON.stringify({
          primaryCategoryId: null,
          confidence: 0.2,
          suggestedNewCategory: {
            name: 'Home Renovation',
            slug: 'Home Renovation!!',
            serviceGroup: 'home_renovation',
          },
        }),
        CANDIDATES,
      );
      expect(result.suggestedNewCategory).toBeNull();
      expect(result.categoryId).toBeNull();
      expect(result.confidence).toBe(0.2);
    });

    it('drops a malformed suggestion (empty name) rather than failing the whole response', () => {
      const result = parseCategorizationResponse(
        JSON.stringify({
          primaryCategoryId: null,
          confidence: 0.2,
          suggestedNewCategory: { name: '', slug: 'home-renovation', serviceGroup: 'home_renovation' },
        }),
        CANDIDATES,
      );
      expect(result.suggestedNewCategory).toBeNull();
    });
  });
});
