<<<<<<< HEAD
import { BRAND_COLORS, BRAND_FONT_BODY } from '../brand.js';
=======
import { BRAND_COLORS, BRAND_FONT } from '../brand.js';
>>>>>>> 8e37ccd7b7ac19849c4ba3b08a803cc49cbe28f7
import { HOW_WE_WORK } from '../staticContent.js';
import { addSlideTitle, type Slide } from './cardHelpers.js';

/** Reference deck page 12 ("How We Work") — 5 numbered bars, fully static. */
export function addHowWeWorkSlide(slide: Slide): void {
  slide.background = { color: BRAND_COLORS.white };
  addSlideTitle(slide, [{ text: 'How We Work', color: BRAND_COLORS.teal }]);

  const barH = 0.75;
  const gapY = 0.15;
  const startY = 1.7;
  const startX = 0.9;
  const barW = 10.8;

  HOW_WE_WORK.forEach((point, i) => {
    const y = startY + i * (barH + gapY);

    slide.addShape('rect', {
      x: startX,
      y,
      w: 0.7,
      h: barH,
      fill: { color: BRAND_COLORS.orange },
      line: { color: BRAND_COLORS.orange, width: 0 },
    });
    slide.addText(String(i + 1), {
      x: startX,
      y,
      w: 0.7,
      h: barH,
      fontSize: 20,
      bold: true,
      color: BRAND_COLORS.white,
      align: 'center',
      valign: 'middle',
    });
    slide.addShape('rect', {
      x: startX + 0.7,
      y: y + barH / 2 - 0.01,
      w: barW - 0.7,
      h: 0.02,
      fill: { color: BRAND_COLORS.orange },
      line: { color: BRAND_COLORS.orange, width: 0 },
    });
    slide.addText(point, {
      x: startX + 0.9,
      y,
      w: barW - 1.1,
      h: barH,
      fontSize: 14,
      bold: true,
      color: BRAND_COLORS.teal,
<<<<<<< HEAD
      fontFace: BRAND_FONT_BODY,
=======
      fontFace: BRAND_FONT,
>>>>>>> 8e37ccd7b7ac19849c4ba3b08a803cc49cbe28f7
      valign: 'middle',
    });
  });
}
