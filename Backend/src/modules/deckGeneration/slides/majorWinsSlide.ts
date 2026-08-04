import { BRAND_COLORS, BRAND_FONT_BODY } from '../brand.js';
import { TESTIMONIALS } from '../staticContent.js';
import { addSlideTitle, type Slide } from './cardHelpers.js';

/** Reference deck page 13 ("Major Wins") — testimonial excerpts, fully static. */
export function addMajorWinsSlide(slide: Slide): void {
  slide.background = { color: BRAND_COLORS.white };
  addSlideTitle(slide, [{ text: 'Major Wins', color: BRAND_COLORS.teal }]);

  const cardW = 3.85;
  const cardH = 4.9;
  const gapX = 0.2;
  const startX = 0.65;
  const startY = 1.6;

  TESTIMONIALS.forEach((testimonial, i) => {
    const x = startX + i * (cardW + gapX);
    const accent = i % 2 === 0 ? BRAND_COLORS.teal : BRAND_COLORS.orange;

    slide.addShape('roundRect', {
      x,
      y: startY,
      w: cardW,
      h: cardH,
      rectRadius: 0.06,
      fill: { color: BRAND_COLORS.cream },
      line: { color: accent, width: 1.25 },
    });
    slide.addText('★★★★★', {
      x: x + 0.2,
      y: startY + 0.2,
      w: cardW - 0.4,
      h: 0.4,
      fontSize: 16,
      color: BRAND_COLORS.orange,
    });
    slide.addText(`“${testimonial.quote}”`, {
      x: x + 0.25,
      y: startY + 0.75,
      w: cardW - 0.5,
      h: cardH - 1.6,
      fontSize: 11,
      italic: true,
      color: BRAND_COLORS.textDark,
      fontFace: BRAND_FONT_BODY,
      valign: 'top',
      lineSpacingMultiple: 1.25,
    });
    slide.addText(`— ${testimonial.attribution}`, {
      x: x + 0.25,
      y: startY + cardH - 0.7,
      w: cardW - 0.5,
      h: 0.5,
      fontSize: 10.5,
      bold: true,
      color: accent,
      fontFace: BRAND_FONT_BODY,
      valign: 'top',
    });
  });
}
