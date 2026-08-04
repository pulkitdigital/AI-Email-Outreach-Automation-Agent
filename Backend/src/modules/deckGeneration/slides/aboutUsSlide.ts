import { BRAND_COLORS, BRAND_FONT_BODY, BRAND_FONT_HEADING } from '../brand.js';
import { ABOUT_US } from '../staticContent.js';
import type { Slide } from './cardHelpers.js';

/** Reference deck page 2 — fully static. */
export function addAboutUsSlide(slide: Slide): void {
  slide.background = { color: BRAND_COLORS.white };

  slide.addShape('roundRect', {
    x: 1.5,
    y: 1.4,
    w: 10.33,
    h: 4.6,
    rectRadius: 0.06,
    fill: { color: BRAND_COLORS.cream },
    line: { color: BRAND_COLORS.orange, width: 1.5 },
  });

  slide.addText('About Us', {
    x: 1.5,
    y: 1.9,
    w: 10.33,
    h: 0.8,
    fontSize: 34,
    bold: true,
    color: BRAND_COLORS.teal,
    fontFace: BRAND_FONT_HEADING,
    align: 'center',
  });

  slide.addText(ABOUT_US.eyebrow, {
    x: 2.3,
    y: 3.0,
    w: 8.73,
    h: 0.5,
    fontSize: 16,
    bold: true,
    color: BRAND_COLORS.orange,
    fontFace: BRAND_FONT_HEADING,
    align: 'center',
  });

  slide.addText(ABOUT_US.body, {
    x: 2.3,
    y: 3.6,
    w: 8.73,
    h: 1.8,
    fontSize: 14,
    color: BRAND_COLORS.orange,
    fontFace: BRAND_FONT_BODY,
    align: 'center',
    valign: 'top',
    lineSpacingMultiple: 1.3,
  });
}
