import type { CategorizationMethod } from './lead.js';

/**
 * Which field(s) of a lead a categorization_rules row is matched against. 'any' concatenates
 * industry + company_name + website + a flattened raw_data blob into one search corpus — the
 * cheapest way to author a rule when you don't care which specific field it hits.
 */
export type CategorizationRuleMatchField =
  'industry' | 'company_name' | 'website' | 'raw_data' | 'any';

export type CategorizationRuleMatchType = 'keyword' | 'regex';

export interface CategorizationRule {
  id: string;
  categoryId: string;
  matchField: CategorizationRuleMatchField;
  matchType: CategorizationRuleMatchType;
  pattern: string;
  weight: number;
  isActive: boolean;
}

export interface CategoryMatch {
  categoryId: string;
  confidence: number;
}

/** Result of running the hybrid categorization pipeline on a single lead. */
export interface CategorizationOutcome {
  primary: CategoryMatch | null;
  secondary: CategoryMatch[];
  method: CategorizationMethod;
}
