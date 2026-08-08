import type { ServiceCategoryContent } from './serviceCatalog.js';

/**
 * Per-lead values every personalized slide builder needs — deliberately minimal. This is what
 * buildDeckPdfForLead() (pdf/generateDeckPdf.ts) actually passes down to <DeckDocument>; callers
 * of buildDeckPdfForLead itself pass the narrower DeckContextInput below, not this.
 */
export interface DeckContext extends DeckContextInput {
  /**
   * DB-sourced replacement for serviceCatalog.ts's (now-legacy) SERVICE_CATEGORIES — fetched once
   * per deck build via categoryContentRepository.listAllCategoryContent('our_services') and
   * reshaped to this exact legacy shape so orderCategoriesForLead() (OurServicesSlide.tsx) and its
   * own type signature don't need to change at all.
   */
  ourServicesCategories: ServiceCategoryContent[];
  /**
   * DB-sourced replacement for staticContent.ts's (now-legacy) HOW_CAN_WE_HELP_BY_CATEGORY, keyed
   * by category slug — fetched via listAllCategoryContent('how_can_we_help'). The flat, category-
   * independent HOW_CAN_WE_HELP master label list itself stays static (see staticContent.ts's own
   * comment): category_content is scoped per-category, so it has no natural row for an unscoped
   * master ordering, and reconstructing one from these per-category subsets would NOT reproduce
   * the original label order (verified while building this).
   */
  howCanWeHelpByCategory: Record<string, string[]>;
}

/** What callers of buildDeckPdfForLead (deckGenerationService.ts) actually provide — the DB-sourced fields above are fetched internally, not supplied by the caller. */
export interface DeckContextInput {
  companyName: string;
  primaryCategorySlug: string | null;
  /**
   * Optional lead-provided industry, rendered as a short secondary line under "Prepared for
   * {companyName}" on the cover slide (pdf/slides/CoverSlide.tsx) when present. Often null —
   * that line simply doesn't render rather than showing a fabricated placeholder.
   */
  industry: string | null;
}
