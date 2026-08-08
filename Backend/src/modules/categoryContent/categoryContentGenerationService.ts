import { BRAND_COLORS } from '../deckGeneration/brand.js';
import {
  createCategoryContent,
  listAllCategoryContent,
} from '../../db/repositories/categoryContentRepository.js';
import type { CategoryRecord } from '../../db/repositories/categoriesRepository.js';
import { getAIProvider } from '../../providers/ai/index.js';

/**
 * Generates and stores both category_content rows ('our_services' + 'how_can_we_help') for one
 * category via AI — the single shared implementation behind both Part A (the one-time
 * scripts/backfillCategoryContent.ts backfill for pre-existing categories with no content yet)
 * and Part B (categorizationService.ts auto-creating a brand-new category on the fly). Always
 * marks is_ai_generated = true — this path never runs for the original 4 hand-seeded categories,
 * which already have content from migrations/0010_category_content.sql.
 *
 * Throws on any failure (AI call, response validation, DB write) — never silently produces
 * partial/guessed content. Callers decide what a failure means for them: the backfill script logs
 * and moves on to the next category; categorizationService.ts logs and still lets the lead
 * categorize into the (already-created) category, flagging it for a later backfill run.
 *
 * accent_color is NOT asked of the AI — it's a purely mechanical teal/orange alternation (matching
 * the original 4 categories' own pattern, see migrations/0010_category_content.sql), decided here
 * from how many 'our_services' rows already exist, not a creative judgment call worth spending a
 * model call on.
 */
export async function generateAndStoreCategoryContent(category: CategoryRecord): Promise<void> {
  const content = await getAIProvider().generateCategoryContent({
    categoryName: category.name,
    serviceGroup: category.serviceGroup,
  });

  const existingOurServicesCount = (await listAllCategoryContent('our_services')).length;
  const accentColor = existingOurServicesCount % 2 === 0 ? BRAND_COLORS.teal : BRAND_COLORS.orange;

  await createCategoryContent({
    categoryId: category.id,
    contentType: 'our_services',
    displayName: category.name,
    accentColor,
    services: content.services,
    isAiGenerated: true,
  });

  await createCategoryContent({
    categoryId: category.id,
    contentType: 'how_can_we_help',
    displayName: category.name,
    benefits: content.relevantBenefits,
    isAiGenerated: true,
  });
}
