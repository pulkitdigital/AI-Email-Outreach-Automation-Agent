import { BRAND_COLORS, BRAND_FONT } from '../brand.js';
import { OUR_STORY } from '../staticContent.js';
import { addSlideTitle, type Slide } from './cardHelpers.js';

/**
 * Reference deck page 3 ("Our Story") — a 6-step circular founder-story diagram in the
 * original. Simplified here to a 3x2 numbered grid: a literal circular layout with connecting
 * arcs is impractical to reproduce faithfully in pptxgenjs, and a grid conveys the same content
 * without the visual fragility. Fully static (founder narrative, not lead-specific).
 */
export function addOurStorySlide(slide: Slide): void {
  slide.background = { color: BRAND_COLORS.white };
  addSlideTitle(slide, [
    { text: 'Our ', color: BRAND_COLORS.teal },
    { text: 'Story', color: BRAND_COLORS.orange },
  ]);

  const cols = 3;
  const cardW = 3.9;
  const cardH = 2.55;
  const gapX = 0.25;
  const gapY = 0.25;
  const startX = 0.6;
  const startY = 1.55;

  OUR_STORY.forEach((step, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (cardW + gapX);
    const y = startY + row * (cardH + gapY);
    const accent = i % 2 === 0 ? BRAND_COLORS.teal : BRAND_COLORS.orange;

    slide.addShape('roundRect', {
      x,
      y,
      w: cardW,
      h: cardH,
      rectRadius: 0.06,
      fill: { color: BRAND_COLORS.white },
      line: { color: accent, width: 1.25 },
    });
    slide.addShape('ellipse', {
      x: x + 0.15,
      y: y + 0.15,
      w: 0.4,
      h: 0.4,
      fill: { color: accent },
      line: { color: accent, width: 0 },
    });
    slide.addText(String(step.step), {
      x: x + 0.15,
      y: y + 0.15,
      w: 0.4,
      h: 0.4,
      fontSize: 14,
      bold: true,
      color: BRAND_COLORS.white,
      align: 'center',
      valign: 'middle',
    });
    slide.addText(step.title, {
      x: x + 0.65,
      y: y + 0.15,
      w: cardW - 0.8,
      h: 0.45,
      fontSize: 13,
      bold: true,
      color: accent,
      fontFace: BRAND_FONT,
      valign: 'middle',
    });
    slide.addText(step.body, {
      x: x + 0.2,
      y: y + 0.75,
      w: cardW - 0.4,
      h: cardH - 0.9,
      fontSize: 10.5,
      color: BRAND_COLORS.textDark,
      fontFace: BRAND_FONT,
      valign: 'top',
      lineSpacingMultiple: 1.2,
    });
  });
}
