import { BRAND_COLORS } from '../brand.js';
import { TECHNOLOGY_SOLUTIONS } from '../staticContent.js';
import { addSlideTitle, drawIconCard, type Slide } from './cardHelpers.js';

const ICONS = ['💻', '📱', '🤖'];
const ACCENTS = [BRAND_COLORS.teal, BRAND_COLORS.orange, BRAND_COLORS.teal];

/** Reference deck page 6 ("Technology Solutions") — 3 columns, fully static. */
export function addTechnologySolutionsSlide(slide: Slide): void {
  slide.background = { color: BRAND_COLORS.white };
  addSlideTitle(slide, [
    { text: 'Technology ', color: BRAND_COLORS.teal },
    { text: 'Solutions', color: BRAND_COLORS.orange },
  ]);

  const cardW = 3.6;
  const cardH = 3.2;
  const gapX = 0.4;
  const startX = 1.2;
  const startY = 2.0;

  TECHNOLOGY_SOLUTIONS.forEach((column, i) => {
    drawIconCard(slide, {
      x: startX + i * (cardW + gapX),
      y: startY,
      w: cardW,
      h: cardH,
      icon: ICONS[i] ?? '✨',
      accentColor: ACCENTS[i] ?? BRAND_COLORS.teal,
      title: column.title,
      items: column.items,
    });
  });
}
