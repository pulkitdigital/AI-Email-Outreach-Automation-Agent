import { BRAND_COLORS, BRAND_CONTACT, BRAND_FONT_BODY, BRAND_FONT_HEADING } from '../brand.js';
import type { DeckContext } from '../types.js';
import type { Slide } from './cardHelpers.js';

/** Reference deck page 14 ("Thank You") — PERSONALIZED: closing line addresses the lead's company by name. */
export function addThankYouSlide(slide: Slide, ctx: DeckContext): void {
  slide.background = { color: BRAND_COLORS.white };

  slide.addText(
    [
      { text: 'Thank ', options: { color: BRAND_COLORS.teal, bold: true } },
      { text: 'You', options: { color: BRAND_COLORS.orange, bold: true } },
    ],
    { x: 1.5, y: 1.1, w: 10.33, h: 1.1, fontSize: 54, fontFace: BRAND_FONT_HEADING, align: 'center' },
  );

  slide.addText(`We look forward to partnering with ${ctx.companyName}.`, {
    x: 1.5,
    y: 2.25,
    w: 10.33,
    h: 0.5,
    fontSize: 16,
    italic: true,
    color: BRAND_COLORS.teal,
    fontFace: BRAND_FONT_BODY,
    align: 'center',
    // Same reasoning as coverSlide.ts's "Prepared exclusively for ..." line: ctx.companyName is
    // free-text lead data with no length cap, rendered here as a single centered line with no
    // `wrap`, so a long company name could otherwise clip or overflow this box. `fit: 'shrink'`
    // (the modern, non-deprecated equivalent of `shrinkText`) shrinks the font instead.
    fit: 'shrink',
  });

  slide.addText(
    [
      { text: 'Be', options: { color: BRAND_COLORS.orange, bold: true } },
      { text: 'Beyond', options: { color: BRAND_COLORS.teal, bold: true } },
      { text: ' Digital Solutions', options: { color: BRAND_COLORS.teal, bold: true } },
    ],
    { x: 1.5, y: 2.95, w: 10.33, h: 0.6, fontSize: 24, fontFace: BRAND_FONT_HEADING, align: 'center' },
  );
  slide.addText(BRAND_CONTACT.tagline, {
    x: 1.5,
    y: 3.55,
    w: 10.33,
    h: 0.5,
    fontSize: 17,
    bold: true,
    color: BRAND_COLORS.orange,
    fontFace: BRAND_FONT_HEADING,
    align: 'center',
  });

  const contactY = 4.5;
  slide.addText(`📞  ${BRAND_CONTACT.phone}`, {
    x: 2.0,
    y: contactY,
    w: 4.5,
    h: 0.4,
    fontSize: 13,
    bold: true,
    color: BRAND_COLORS.teal,
    fontFace: BRAND_FONT_BODY,
  });
  slide.addText(`✉️  ${BRAND_CONTACT.email}`, {
    x: 6.8,
    y: contactY,
    w: 4.5,
    h: 0.4,
    fontSize: 13,
    bold: true,
    color: BRAND_COLORS.teal,
    fontFace: BRAND_FONT_BODY,
  });
  slide.addText(`📍  ${BRAND_CONTACT.address}`, {
    x: 2.0,
    y: contactY + 0.5,
    w: 9.3,
    h: 0.4,
    fontSize: 13,
    bold: true,
    color: BRAND_COLORS.orange,
    fontFace: BRAND_FONT_BODY,
  });
}
