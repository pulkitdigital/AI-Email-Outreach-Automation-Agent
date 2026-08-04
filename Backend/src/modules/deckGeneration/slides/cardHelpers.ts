import { BRAND_COLORS, BRAND_FONT_BODY, BRAND_FONT_HEADING } from '../brand.js';
import type { Slide } from '../pptxgenLoader.js';

export type { Slide };

/** Standard title treatment used across every slide: two-tone heading + underline rule. */
export function addSlideTitle(
  slide: Slide,
  parts: Array<{ text: string; color: string }>,
  opts: { x?: number; y?: number; fontSize?: number } = {},
): void {
  const { x = 0.6, y = 0.4, fontSize = 32 } = opts;
  slide.addText(
    parts.map((p) => ({ text: p.text, options: { color: p.color, bold: true } })),
    { x, y, w: 10, h: 0.8, fontSize, fontFace: BRAND_FONT_HEADING, align: 'left' },
  );
  slide.addShape('rect', {
    x,
    y: y + 0.75,
    w: 2.6,
    h: 0.04,
    fill: { color: BRAND_COLORS.teal },
    line: { color: BRAND_COLORS.teal, width: 0 },
  });
}

/** A rounded-corner icon card: circular emoji badge + title + bullet list — the recurring visual pattern across How Can We Help / Technology Solutions / Our Services / Service Deep Dive. */
export function drawIconCard(
  slide: Slide,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    icon: string;
    accentColor: string;
    title: string;
    items?: string[];
    highlighted?: boolean;
  },
): void {
  const { x, y, w, h, icon, accentColor, title, items = [], highlighted = false } = opts;

  slide.addShape('roundRect', {
    x,
    y,
    w,
    h,
    rectRadius: 0.08,
    fill: { color: highlighted ? BRAND_COLORS.cream : BRAND_COLORS.white },
    line: { color: accentColor, width: highlighted ? 2.5 : 1.25 },
  });

  const circleSize = 0.55;
  slide.addShape('ellipse', {
    x: x + w / 2 - circleSize / 2,
    y: y + 0.2,
    w: circleSize,
    h: circleSize,
    fill: { color: accentColor },
    line: { color: accentColor, width: 0 },
  });
  slide.addText(icon, {
    x: x + w / 2 - circleSize / 2,
    y: y + 0.2,
    w: circleSize,
    h: circleSize,
    fontSize: 18,
    align: 'center',
    valign: 'middle',
    color: BRAND_COLORS.white,
  });

  slide.addText(title, {
    x: x + 0.1,
    y: y + circleSize + 0.3,
    w: w - 0.2,
    h: 0.4,
    fontSize: 13,
    bold: true,
    align: 'center',
    color: accentColor,
    fontFace: BRAND_FONT_HEADING,
  });

  if (items.length > 0) {
    slide.addText(
      items.map((item) => ({ text: `✓ ${item}`, options: { breakLine: true } })),
      {
        x: x + 0.25,
        y: y + circleSize + 0.75,
        w: w - 0.5,
        h: h - circleSize - 0.9,
        fontSize: 10.5,
        color: BRAND_COLORS.textDark,
        fontFace: BRAND_FONT_BODY,
        valign: 'top',
        lineSpacingMultiple: 1.3,
      },
    );
  }

  if (highlighted) {
    slide.addText('RECOMMENDED FOR YOU', {
      x,
      y: y - 0.28,
      w,
      h: 0.26,
      fontSize: 9,
      bold: true,
      align: 'center',
      color: BRAND_COLORS.white,
      fill: { color: accentColor },
    });
  }
}
