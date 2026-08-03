import { BRAND_COLORS } from '../brand.js';
import { orderCategoriesForLead, SERVICE_CATEGORIES } from '../serviceCatalog.js';
import type { DeckContext } from '../types.js';
import { addSlideTitle, drawIconCard, type Slide } from './cardHelpers.js';

const ICON_BY_SLUG: Record<string, string> = {
  'digital-marketing': '📣',
  'web-app-solutions': '🌐',
  'creative-services': '🎨',
  'marketplace-commerce': '🛒',
};

/**
 * Reference deck page 7 ("Our Services") — PERSONALIZED: the lead's primary category (from
 * categorization, Phase 2) is moved to the front and visually highlighted (thicker border,
 * "Recommended For You" badge). The other 3 categories keep their original relative order.
 */
export function addOurServicesSlide(slide: Slide, ctx: DeckContext): void {
  slide.background = { color: BRAND_COLORS.white };
  addSlideTitle(slide, [
    { text: 'Our ', color: BRAND_COLORS.teal },
    { text: 'Services', color: BRAND_COLORS.orange },
  ]);
  slide.addText('Technology, Marketing & Creative Solutions', {
    x: 0.6,
    y: 1.25,
    w: 10,
    h: 0.35,
    fontSize: 13,
    color: BRAND_COLORS.textMuted,
    align: 'left',
  });

  const ordered = orderCategoriesForLead(SERVICE_CATEGORIES, ctx.primaryCategorySlug);

  const cardW = 2.95;
  const cardH = 4.4;
  const gapX = 0.2;
  const startX = 0.65;
  const startY = 2.15;

  ordered.forEach((category, i) => {
    drawIconCard(slide, {
      x: startX + i * (cardW + gapX),
      y: startY,
      w: cardW,
      h: cardH,
      icon: ICON_BY_SLUG[category.slug] ?? '⭐',
      accentColor: category.accentColor,
      title: `${i + 1}. ${category.displayName}`,
      items: category.services,
      highlighted: category.slug === ctx.primaryCategorySlug,
    });
  });
}
