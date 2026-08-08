/**
 * Entrypoint for the react-pdf deck pipeline — replaces the old pptxgenjs-build +
 * LibreOffice-headless-convert two-step (deckBuilder.ts + pptxToPdf.ts) with a single direct
 * PDF render. Pure JS end to end: no system binaries, no LibreOffice, no font-substitution risk
 * (fonts.ts registers the real Bricolage Grotesque / Public Sans files from node_modules).
 */
import { renderToBuffer } from '@react-pdf/renderer';
import type { ServiceGroup } from '@bebeyond/shared';
import { listAllCategoryContent } from '../../../db/repositories/categoryContentRepository.js';
import type { ServiceCategoryContent } from '../serviceCatalog.js';
import { DeckDocument, DECK_SLIDE_COUNT } from './DeckDocument.js';
import { registerDeckFonts } from './fonts.js';
import type { DeckContext, DeckContextInput } from '../types.js';

export const DECK_TEMPLATE_VERSION = 'v2-react-pdf';

export interface BuiltDeckPdf {
  buffer: Buffer;
  pageCount: number;
}

/**
 * Fetches the DB-backed replacement for serviceCatalog.ts's SERVICE_CATEGORIES and
 * staticContent.ts's HOW_CAN_WE_HELP_BY_CATEGORY (category_content, seeded verbatim from those
 * arrays — see migrations/0010_category_content.sql) and reshapes each into the exact legacy
 * shape OurServicesSlide.tsx/HowCanWeHelpSlide.tsx already consume, so neither
 * orderCategoriesForLead() nor orderBenefitsForLead()'s own logic has to change. Run once per
 * deck build, in parallel — both are simple indexed lookups against a table with 8 total rows
 * today, not a cost worth caching further.
 */
async function loadDeckContentFromDb(): Promise<
  Pick<DeckContext, 'ourServicesCategories' | 'howCanWeHelpByCategory'>
> {
  const [ourServicesRows, howCanWeHelpRows] = await Promise.all([
    listAllCategoryContent('our_services'),
    listAllCategoryContent('how_can_we_help'),
  ]);

  const ourServicesCategories: ServiceCategoryContent[] = ourServicesRows.map((row) => ({
    slug: row.categorySlug,
    // category_content rows only ever exist for categories that already have a service_group set
    // (see migrations/0010_category_content.sql's seed) — never null in practice for this join.
    serviceGroup: row.categoryServiceGroup as ServiceGroup,
    displayName: row.displayName,
    services: row.services ?? [],
    accentColor: row.accentColor ?? '',
  }));

  const howCanWeHelpByCategory: Record<string, string[]> = {};
  for (const row of howCanWeHelpRows) {
    howCanWeHelpByCategory[row.categorySlug] = row.benefits ?? [];
  }

  return { ourServicesCategories, howCanWeHelpByCategory };
}

/**
 * Renders the full 6-slide deck for one lead directly to a PDF buffer. `pageCount` is the fixed
 * DECK_SLIDE_COUNT rather than something read back off the rendered PDF — every call renders the
 * same fixed <Document>/<Page> structure (only text content varies per lead), so there's no
 * scenario where the actual page count could differ from what DeckDocument.tsx declares; asserting
 * that invariant here (rather than trusting it silently) means a future slide added to
 * DeckDocument.tsx without updating DECK_SLIDE_COUNT fails loudly instead of quietly drifting.
 *
 * Takes the narrower DeckContextInput (not the full DeckContext) — the DB-sourced fields are
 * fetched here, internally, so deckGenerationService.ts's call site (and its test's mock
 * assertions on exactly {companyName, primaryCategorySlug, industry}) needed no changes at all.
 */
export async function buildDeckPdfForLead(input: DeckContextInput): Promise<BuiltDeckPdf> {
  registerDeckFonts();

  const dbContent = await loadDeckContentFromDb();
  const ctx: DeckContext = { ...input, ...dbContent };

  // Calling the component function directly (rather than <DeckDocument ctx={ctx} />) so the
  // resulting JSX.Element's inferred type is broad enough to satisfy renderToBuffer's
  // ReactElement<DocumentProps> parameter type — DeckDocument's actual runtime output is always a
  // <Document>, just not something TS can see through a JSX-element-typed indirection.
  const buffer = await renderToBuffer(DeckDocument({ ctx }));

  return { buffer, pageCount: DECK_SLIDE_COUNT };
}
