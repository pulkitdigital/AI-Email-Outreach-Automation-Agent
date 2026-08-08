import type { GenerateCategoryContentInput } from '@bebeyond/shared';
import { HOW_CAN_WE_HELP } from '../../../modules/deckGeneration/staticContent.js';

/**
 * Shared prompt text for both Gemini and OpenAI — same pattern as prompts/categorization.ts and
 * prompts/categoryClassification.ts. Used by categoryContentGenerationService.ts for a category
 * that has no category_content rows yet, whether via the one-time backfill script or the
 * auto-create-on-categorize flow (categorizationService.ts).
 */
export function buildCategoryContentPrompt(input: GenerateCategoryContentInput): string {
  const benefitsList = HOW_CAN_WE_HELP.map((label) => `- ${label}`).join('\n');

  return `You are proposing pitch-deck content for a lead service category at BeBeyond Digital Solutions, a digital agency.

Category name: "${input.categoryName}"${input.serviceGroup ? `\nService group: ${input.serviceGroup}` : ''}

Task 1 — Services list: propose 4 to 6 short service names this category would plausibly offer, matching the style of these existing examples (2-4 words each, comma-style short phrases, no descriptions or sentences):
- Digital Marketing: SMM, Performance Marketing, Branding, GMB, SEO / GEO, Influencer Marketing
- Web & App Solutions: Website, E-commerce Website, App Development, Shopify Website, WhatsApp Automation
- Creative Services: Logo Design, Design Creatives, Video Editing, Photoshoot & Videoshoot, Ad Shoot Listing
- Marketplace & Commerce: E-commerce Marketplace Setup, Amazon, Flipkart, Meesho, Myntra

Task 2 — Relevant benefits: choose exactly 2 to 3 labels from this FIXED list of 8 — use the exact text shown, do not invent new labels, do not paraphrase:
${benefitsList}

Respond with ONLY a JSON object in exactly this shape, no other text, no markdown fences:
{
  "services": [<4 to 6 short service name strings>],
  "relevantBenefits": [<2 to 3 strings, each exactly matching one of the 8 fixed labels above>]
}`;
}
