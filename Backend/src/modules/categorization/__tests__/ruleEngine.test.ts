import { describe, expect, it } from 'vitest';
import type { CategorizationRule } from '@bebeyond/shared';
import { evaluateRules } from '../ruleEngine.js';

function rule(overrides: Partial<CategorizationRule>): CategorizationRule {
  return {
    id: 'rule-id',
    categoryId: 'category-id',
    matchField: 'any',
    matchType: 'keyword',
    pattern: 'x',
    weight: 0.35,
    isActive: true,
    ...overrides,
  };
}

describe('evaluateRules', () => {
  it('confidently matches on a single strong industry-field hit (pure rule match)', () => {
    const rules: CategorizationRule[] = [
      rule({
        id: 'r1',
        categoryId: 'cat-dm',
        matchField: 'industry',
        pattern: 'restaurant',
        weight: 0.6,
      }),
    ];

    const result = evaluateRules(
      { industry: 'Restaurant', companyName: null, website: null, rawData: {} },
      rules,
    );

    expect(result.primary).toEqual({ categoryId: 'cat-dm', confidence: 0.6 });
    expect(result.secondary).toEqual([]);
  });

  it('returns no primary and no secondary when nothing matches', () => {
    const rules: CategorizationRule[] = [
      rule({
        id: 'r1',
        categoryId: 'cat-dm',
        matchField: 'industry',
        pattern: 'restaurant',
        weight: 0.6,
      }),
    ];

    const result = evaluateRules(
      { industry: 'Aerospace Engineering', companyName: 'Acme', website: null, rawData: {} },
      rules,
    );

    expect(result.primary).toBeNull();
    expect(result.secondary).toEqual([]);
  });

  it('boundary case: a single weak any-field hit crosses the secondary threshold but not primary', () => {
    const rules: CategorizationRule[] = [
      rule({
        id: 'r1',
        categoryId: 'cat-marketplace',
        matchField: 'any',
        pattern: 'clothing',
        weight: 0.35,
      }),
    ];

    const result = evaluateRules(
      {
        industry: null,
        companyName: null,
        website: null,
        rawData: { notes: 'Sells clothing online' },
      },
      rules,
    );

    expect(result.primary).toBeNull();
    expect(result.secondary).toEqual([{ categoryId: 'cat-marketplace', confidence: 0.35 }]);
  });

  it('two weak any-field hits for the same category sum to cross the primary threshold', () => {
    const rules: CategorizationRule[] = [
      rule({
        id: 'r1',
        categoryId: 'cat-creative',
        matchField: 'any',
        pattern: 'photographer',
        weight: 0.35,
      }),
      rule({
        id: 'r2',
        categoryId: 'cat-creative',
        matchField: 'any',
        pattern: 'wedding',
        weight: 0.35,
      }),
    ];

    const result = evaluateRules(
      { industry: null, companyName: 'Wedding Photographer Studio', website: null, rawData: {} },
      rules,
    );

    expect(result.primary).toEqual({ categoryId: 'cat-creative', confidence: 0.7 });
  });

  it('caps secondary matches at MAX_SECONDARY_CATEGORIES and ranks by confidence', () => {
    const rules: CategorizationRule[] = [
      rule({ id: 'r1', categoryId: 'cat-a', matchField: 'any', pattern: 'alpha', weight: 0.9 }),
      rule({ id: 'r2', categoryId: 'cat-b', matchField: 'any', pattern: 'beta', weight: 0.45 }),
      rule({ id: 'r3', categoryId: 'cat-c', matchField: 'any', pattern: 'gamma', weight: 0.4 }),
      rule({ id: 'r4', categoryId: 'cat-d', matchField: 'any', pattern: 'delta', weight: 0.35 }),
    ];

    const result = evaluateRules(
      {
        industry: null,
        companyName: null,
        website: null,
        rawData: { notes: 'alpha beta gamma delta' },
      },
      rules,
    );

    expect(result.primary).toEqual({ categoryId: 'cat-a', confidence: 0.9 });
    expect(result.secondary).toEqual([
      { categoryId: 'cat-b', confidence: 0.45 },
      { categoryId: 'cat-c', confidence: 0.4 },
    ]);
  });

  it('ignores inactive rules entirely', () => {
    const rules: CategorizationRule[] = [
      rule({
        id: 'r1',
        categoryId: 'cat-dm',
        matchField: 'industry',
        pattern: 'restaurant',
        weight: 0.6,
        isActive: false,
      }),
    ];

    const result = evaluateRules(
      { industry: 'Restaurant', companyName: null, website: null, rawData: {} },
      rules,
    );

    expect(result.primary).toBeNull();
  });

  it('supports regex match type', () => {
    const rules: CategorizationRule[] = [
      rule({
        id: 'r1',
        categoryId: 'cat-web',
        matchField: 'website',
        matchType: 'regex',
        pattern: '\\.myshopify\\.com$',
        weight: 0.6,
      }),
    ];

    const result = evaluateRules(
      { industry: null, companyName: null, website: 'store.myshopify.com', rawData: {} },
      rules,
    );

    expect(result.primary).toEqual({ categoryId: 'cat-web', confidence: 0.6 });
  });

  it('does not crash on a malformed regex pattern — fails closed for that rule', () => {
    const rules: CategorizationRule[] = [
      rule({
        id: 'r1',
        categoryId: 'cat-web',
        matchField: 'website',
        matchType: 'regex',
        pattern: '(unterminated',
        weight: 0.6,
      }),
    ];

    const result = evaluateRules(
      { industry: null, companyName: null, website: 'anything', rawData: {} },
      rules,
    );

    expect(result.primary).toBeNull();
  });
});
