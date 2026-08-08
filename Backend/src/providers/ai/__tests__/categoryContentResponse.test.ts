import { describe, expect, it } from 'vitest';
import { parseCategoryContentResponse } from '../categoryContentResponse.js';

describe('parseCategoryContentResponse', () => {
  it('parses a well-formed response', () => {
    const result = parseCategoryContentResponse(
      JSON.stringify({
        services: ['Home Staging', 'Renovation Consulting', 'Interior Styling', 'Project Management'],
        relevantBenefits: ['Confidence and Trust', 'Sense of Achievement'],
      }),
    );

    expect(result).toEqual({
      services: ['Home Staging', 'Renovation Consulting', 'Interior Styling', 'Project Management'],
      relevantBenefits: ['Confidence and Trust', 'Sense of Achievement'],
    });
  });

  it("strips markdown code fences the model wasn't supposed to add", () => {
    const raw =
      '```json\n{"services":["A","B","C","D"],"relevantBenefits":["Peace of Mind"]}\n```';
    const result = parseCategoryContentResponse(raw);
    expect(result.services).toEqual(['A', 'B', 'C', 'D']);
  });

  it('caps services at 6, keeping the first 6', () => {
    const result = parseCategoryContentResponse(
      JSON.stringify({
        services: ['1', '2', '3', '4', '5', '6', '7', '8'],
        relevantBenefits: [],
      }),
    );
    expect(result.services).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('silently drops a hallucinated benefit label not in the fixed 8', () => {
    const result = parseCategoryContentResponse(
      JSON.stringify({
        services: ['A', 'B', 'C', 'D'],
        relevantBenefits: ['Increased Visibility', 'Made Up Benefit'],
      }),
    );
    expect(result.relevantBenefits).toEqual(['Increased Visibility']);
  });

  it('accepts an empty relevantBenefits list after filtering (graceful degradation, no highlight)', () => {
    const result = parseCategoryContentResponse(
      JSON.stringify({
        services: ['A', 'B', 'C', 'D'],
        relevantBenefits: ['Totally Invented Label'],
      }),
    );
    expect(result.relevantBenefits).toEqual([]);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseCategoryContentResponse('not json at all')).toThrow(/not valid JSON/);
  });

  it('rejects a response missing required fields', () => {
    expect(() =>
      parseCategoryContentResponse(JSON.stringify({ relevantBenefits: [] })),
    ).toThrow(/schema validation/);
  });

  it('rejects an empty services list', () => {
    expect(() =>
      parseCategoryContentResponse(JSON.stringify({ services: [], relevantBenefits: [] })),
    ).toThrow(/empty services list/);
  });
});
