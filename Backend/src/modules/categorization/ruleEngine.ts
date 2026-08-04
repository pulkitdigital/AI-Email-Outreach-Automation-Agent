import type { CategorizationRule, CategoryMatch } from '@bebeyond/shared';
import { buildCorpus, type LeadTextFields } from './textCorpus.js';

/** A category needs summed rule weight >= this to be trusted as the confident primary match. */
export const RULE_PRIMARY_CONFIDENCE_THRESHOLD = 0.5;
/** Below primary but still worth surfacing as a secondary category suggestion. */
export const RULE_SECONDARY_CONFIDENCE_THRESHOLD = 0.3;
export const MAX_SECONDARY_CATEGORIES = 2;

function ruleMatches(corpusValue: string, rule: CategorizationRule): boolean {
  if (!corpusValue) return false;

  if (rule.matchType === 'regex') {
    try {
      return new RegExp(rule.pattern, 'i').test(corpusValue);
    } catch {
      // A malformed regex in the DB shouldn't crash categorization for every lead — fail closed.
      return false;
    }
  }

  return corpusValue.toLowerCase().includes(rule.pattern.toLowerCase());
}

export interface RuleEngineResult {
  primary: CategoryMatch | null;
  secondary: CategoryMatch[];
}

/**
 * Pure function: scores every category by summing the weights of its matched rules (capped at
 * 1.0 per category), then splits into a confident primary match and secondary candidates. No
 * DB/AI calls, no hardcoded category logic — every rule is a data row (categorization_rules),
 * so tuning is an SQL UPDATE, not a code change. See Docs/DATABASE_SCHEMA.md § categorization_rules.
 */
export function evaluateRules(lead: LeadTextFields, rules: CategorizationRule[]): RuleEngineResult {
  const corpus = buildCorpus(lead);
  const scoreByCategory = new Map<string, number>();

  for (const rule of rules) {
    if (!rule.isActive) continue;
    if (ruleMatches(corpus[rule.matchField] ?? '', rule)) {
      const current = scoreByCategory.get(rule.categoryId) ?? 0;
      scoreByCategory.set(rule.categoryId, Math.min(1, current + rule.weight));
    }
  }

  const ranked: CategoryMatch[] = [...scoreByCategory.entries()]
    .map(([categoryId, confidence]) => ({ categoryId, confidence }))
    .sort((a, b) => b.confidence - a.confidence);

  const top = ranked[0];

  if (!top || top.confidence < RULE_PRIMARY_CONFIDENCE_THRESHOLD) {
    const secondary = ranked
      .filter((m) => m.confidence >= RULE_SECONDARY_CONFIDENCE_THRESHOLD)
      .slice(0, MAX_SECONDARY_CATEGORIES);
    return { primary: null, secondary };
  }

  const secondary = ranked
    .slice(1)
    .filter((m) => m.confidence >= RULE_SECONDARY_CONFIDENCE_THRESHOLD)
    .slice(0, MAX_SECONDARY_CATEGORIES);

  return { primary: top, secondary };
}
