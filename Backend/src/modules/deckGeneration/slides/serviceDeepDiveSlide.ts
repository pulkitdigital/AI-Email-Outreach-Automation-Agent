import { BRAND_COLORS, BRAND_FONT } from '../brand.js';
import { SERVICE_DEEP_DIVE } from '../staticContent.js';
import { addSlideTitle, type Slide } from './cardHelpers.js';

const ICONS = ['🔍', '🖱️', '👍', '✉️', '💬'];

/**
 * Reference deck page 10 ("Creative Services" — the source deck's own title for this slide,
 * kept as-is; content is a marketing-services deep dive). This is the static "Creative Services
 * detail" section named in the Phase 3 requirements.
 */
export function addServiceDeepDiveSlide(slide: Slide): void {
  slide.background = { color: BRAND_COLORS.white };
  addSlideTitle(slide, [{ text: 'Creative Services', color: BRAND_COLORS.teal }]);

  slide.addShape('roundRect', {
    x: 1.0,
    y: 1.35,
    w: 11.33,
    h: 0.85,
    rectRadius: 0.06,
    fill: { color: BRAND_COLORS.cream },
    line: { color: BRAND_COLORS.orange, width: 1 },
  });
  slide.addText(
    'Smart digital marketing solutions to grow your brand, reach the right audience, and drive better results.',
    {
      x: 1.3,
      y: 1.35,
      w: 10.73,
      h: 0.85,
      fontSize: 13,
      color: BRAND_COLORS.teal,
      fontFace: BRAND_FONT,
      align: 'center',
      valign: 'middle',
    },
  );

  const cardW = 2.15;
  const cardH = 2.6;
  const gapX = 0.15;
  const startX = 0.65;
  const startY = 2.55;

  SERVICE_DEEP_DIVE.forEach((item, i) => {
    const x = startX + i * (cardW + gapX);
    slide.addShape('roundRect', {
      x,
      y: startY,
      w: cardW,
      h: cardH,
      rectRadius: 0.08,
      fill: { color: BRAND_COLORS.white },
      line: { color: BRAND_COLORS.teal, width: 1.25 },
    });
    slide.addShape('ellipse', {
      x: x + cardW / 2 - 0.3,
      y: startY + 0.25,
      w: 0.6,
      h: 0.6,
      fill: { color: BRAND_COLORS.teal },
      line: { color: BRAND_COLORS.teal, width: 0 },
    });
    slide.addText(ICONS[i] ?? '✨', {
      x: x + cardW / 2 - 0.3,
      y: startY + 0.25,
      w: 0.6,
      h: 0.6,
      fontSize: 20,
      align: 'center',
      valign: 'middle',
    });
    slide.addText(item.title, {
      x: x + 0.1,
      y: startY + 1.0,
      w: cardW - 0.2,
      h: 0.6,
      fontSize: 12,
      bold: true,
      color: BRAND_COLORS.teal,
      fontFace: BRAND_FONT,
      align: 'center',
      valign: 'top',
    });
    slide.addText(item.body, {
      x: x + 0.15,
      y: startY + 1.65,
      w: cardW - 0.3,
      h: cardH - 1.75,
      fontSize: 10,
      color: BRAND_COLORS.textDark,
      fontFace: BRAND_FONT,
      align: 'center',
      valign: 'top',
    });
  });
}
