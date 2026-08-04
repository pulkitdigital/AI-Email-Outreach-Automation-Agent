import { BRAND_COLORS, BRAND_CONTACT, BRAND_FONT_HEADING } from '../brand.js';
import type { DeckContext } from '../types.js';
import type { Slide } from './cardHelpers.js';

/** Reference deck page 1. Personalized: company name added below the tagline. */
export function addCoverSlide(slide: Slide, ctx: DeckContext): void {
  slide.background = { color: BRAND_COLORS.white };

  slide.addText(
    [
      { text: 'Be', options: { color: BRAND_COLORS.orange, bold: true } },
      { text: 'Beyond', options: { color: BRAND_COLORS.teal, bold: true } },
    ],
    { x: 1.5, y: 2.2, w: 10.33, h: 1.4, fontSize: 60, fontFace: BRAND_FONT_HEADING, align: 'center' },
  );
  slide.addText('Digital Solutions', {
    x: 1.5,
    y: 3.5,
    w: 10.33,
    h: 0.6,
    fontSize: 24,
    color: BRAND_COLORS.orange,
    fontFace: BRAND_FONT_HEADING,
    align: 'center',
  });
  slide.addText(BRAND_CONTACT.tagline, {
    x: 1.5,
    y: 4.1,
    w: 10.33,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: BRAND_COLORS.orange,
    fontFace: BRAND_FONT_HEADING,
    align: 'center',
  });
  slide.addText(`Prepared exclusively for ${ctx.companyName}`, {
    x: 1.5,
    y: 4.9,
    w: 10.33,
    h: 0.4,
    fontSize: 15,
    italic: true,
    color: BRAND_COLORS.teal,
    fontFace: BRAND_FONT_HEADING,
    align: 'center',
  });
}
