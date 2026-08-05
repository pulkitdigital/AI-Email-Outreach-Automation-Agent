/**
 * AIProvider contract — see docs/ARCHITECTURE.md § Cross-cutting: AI provider abstraction.
 * Mirrors the EmailProvider pattern: consumers depend only on this interface, never on a
 * concrete provider class. AI_PROVIDER in .env selects the implementation at runtime.
 */

import type { CategorizationMethod, ServiceGroup } from './lead.js';

export type AIProviderName = 'gemini' | 'openai';

export interface CategorizeLeadInput {
  leadId: string;
  companyName?: string;
  industry?: string;
  website?: string;
  rawData: Record<string, unknown>;
  /** Available categories to choose from, loaded from the categories table. */
  candidateCategories: Array<{ id: string; name: string; serviceGroup: ServiceGroup | null }>;
}

export interface CategorizeLeadResult {
  /** Best-fit primary category id, or null if the model genuinely couldn't pick one from candidateCategories. */
  categoryId: string | null;
  method: CategorizationMethod;
  confidence: number | null; // 0–1, meaningful only when method === 'ai'
  /** Optional additional plausible category ids, lower confidence than the primary. */
  secondaryCategoryIds?: string[];
}

/**
 * Phase 6 dashboard's manual "Add category" flow (name-only): the model picks the one fixed
 * service_group the new category belongs to and proposes a starter keyword rule set, mirroring
 * how the original 4 seeded categories' rules were "agent-proposed, user-confirmed as a first
 * pass" — see Backend/src/db/migrations/0002_categorization.sql.
 */
export interface ClassifyCategoryInput {
  name: string;
}

export interface ClassifyCategoryRuleSuggestion {
  /** Restricted to 'industry' | 'any' (not the full CategorizationRuleMatchField set) — the two
   *  fields the original seed rules actually used, matching the weight convention below. */
  matchField: 'industry' | 'any';
  pattern: string;
  /** 0.35–0.6, same convention the seed rule set uses — 'industry' hits weighted near 0.6, 'any' hits nearer 0.35. */
  weight: number;
}

export interface ClassifyCategoryResult {
  serviceGroup: ServiceGroup;
  rules: ClassifyCategoryRuleSuggestion[];
}

export interface GenerateDeckContentInput {
  leadId: string;
  companyName?: string;
  industry?: string;
  serviceGroup: ServiceGroup | null;
  /** Base deck sections to personalize (About Us, Our Story, etc.) — content, not layout. */
  baseSections: Record<string, string>;
}

export interface GenerateDeckContentResult {
  sections: Record<string, string>;
}

/**
 * Phase 1 (ingestion): unstructured PDF text — a page pdfParser couldn't confidently turn into
 * a table — is handed here to pull out candidate lead fields. The interface exists now so
 * pdfParser can be written against a stable contract; every implementation is still stubbed
 * (unlike categorizeLead, which Phase 2 wired up for real — see docs/ARCHITECTURE.md § 2
 * Categorization Layer). Until this is implemented, calls are expected to throw and callers
 * must treat that as "flag for manual review", not a hard ingestion failure.
 */
export interface ExtractLeadFieldsFromTextInput {
  sourceText: string;
  sourceFile: string;
}

export interface ExtractedLeadFieldsCandidate {
  email?: string;
  companyName?: string;
  contactName?: string;
  phone?: string;
  website?: string;
  industry?: string;
  /** 0–1 confidence for this candidate row as a whole. */
  confidence: number;
}

export interface ExtractLeadFieldsFromTextResult {
  candidates: ExtractedLeadFieldsCandidate[];
}

/**
 * Phase 4 (Email Composer): generates the persuasive body copy + subject for one sequence-
 * stage email. Deliberately narrow — the model writes paragraphs only, never structural HTML;
 * composerService.ts wraps the result in a fixed template (signature block, unsubscribe
 * footer) that's always present regardless of what the model returns. See
 * docs/ARCHITECTURE.md § 4 Email Composer.
 */
export interface GenerateEmailCopyInput {
  companyName: string;
  contactName?: string;
  industry?: string;
  primaryCategoryName: string;
  primaryCategoryServices: string[];
  stage: 'new' | 'followup' | 'final';
}

export interface GenerateEmailCopyResult {
  subject: string;
  /** Plain paragraphs, no HTML/markdown — composerService escapes and formats this. */
  bodyParagraphs: string[];
}

/**
 * Implemented by backend/src/providers/ai/GeminiProvider.ts and
 * backend/src/providers/ai/OpenAIProvider.ts. Selected at runtime by
 * backend/src/providers/ai/index.ts based on process.env.AI_PROVIDER. As of Phase 4,
 * categorizeLead and generateEmailCopy are fully implemented; generateDeckContent (deck
 * generation turned out not to need AI — see docs/ARCHITECTURE.md § 3) and
 * extractLeadFieldsFromText remain stubbed.
 */
export interface AIProvider {
  getProviderName(): AIProviderName;
  categorizeLead(input: CategorizeLeadInput): Promise<CategorizeLeadResult>;
  generateDeckContent(input: GenerateDeckContentInput): Promise<GenerateDeckContentResult>;
  extractLeadFieldsFromText(
    input: ExtractLeadFieldsFromTextInput,
  ): Promise<ExtractLeadFieldsFromTextResult>;
  generateEmailCopy(input: GenerateEmailCopyInput): Promise<GenerateEmailCopyResult>;
  classifyCategory(input: ClassifyCategoryInput): Promise<ClassifyCategoryResult>;
}
