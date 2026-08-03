import { BRAND_COLORS } from '../brand.js';
import { HOW_CAN_WE_HELP } from '../staticContent.js';
import { addSlideTitle, drawIconCard, type Slide } from './cardHelpers.js';

const ICONS = ['📈', '⚙️', '💰', '🤝', '🏆', '🧘', '🚀', '🥇'];

/** Reference deck page 5 ("How Can We Help?") — 8 benefit cards, fully static. */
export function addHowCanWeHelpSlide(slide: Slide): void {
  slide.background = { color: BRAND_COLORS.white };
  addSlideTitle(slide, [
    { text: 'How can ', color: BRAND_COLORS.teal },
    { text: 'we help?', color: BRAND_COLORS.orange },
  ]);

  const cols = 4;
  const cardW = 2.85;
  const cardH = 2.15;
  const gapX = 0.2;
  const gapY = 0.2;
  const startX = 0.65;
  const startY = 1.6;

  HOW_CAN_WE_HELP.forEach((label, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    drawIconCard(slide, {
      x: startX + col * (cardW + gapX),
      y: startY + row * (cardH + gapY),
      w: cardW,
      h: cardH,
      icon: ICONS[i] ?? '⭐',
      accentColor: i % 2 === 0 ? BRAND_COLORS.teal : BRAND_COLORS.orange,
      title: label,
    });
  });
}
