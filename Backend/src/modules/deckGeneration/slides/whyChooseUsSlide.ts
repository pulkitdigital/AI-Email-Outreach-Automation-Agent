import { BRAND_COLORS, BRAND_FONT_BODY, BRAND_FONT_HEADING } from '../brand.js';
import type { TableRow } from '../pptxgenLoader.js';
import { WHY_CHOOSE_US } from '../staticContent.js';
import { addSlideTitle, type Slide } from './cardHelpers.js';

/** Reference deck page 11 ("Why Choose Us?") — comparison table, fully static, verbatim copy. */
export function addWhyChooseUsSlide(slide: Slide): void {
  slide.background = { color: BRAND_COLORS.white };
  addSlideTitle(slide, [{ text: 'Why Choose Us?', color: BRAND_COLORS.teal }]);

  const headerRow: TableRow = [
    {
      text: 'What You Get?',
      options: {
        fill: { color: BRAND_COLORS.orange },
        color: BRAND_COLORS.white,
        bold: true,
        fontFace: BRAND_FONT_HEADING,
      },
    },
    {
      text: 'BeBeyond Digital Solutions',
      options: {
        fill: { color: BRAND_COLORS.orange },
        color: BRAND_COLORS.white,
        bold: true,
        fontFace: BRAND_FONT_HEADING,
      },
    },
    {
      text: 'Typical Competitors',
      options: {
        fill: { color: BRAND_COLORS.orange },
        color: BRAND_COLORS.white,
        bold: true,
        fontFace: BRAND_FONT_HEADING,
      },
    },
  ];

  const bodyRows: TableRow[] = WHY_CHOOSE_US.map((row, i) => {
    const bg = i % 2 === 0 ? BRAND_COLORS.tealPale : BRAND_COLORS.white;
    return [
      {
        text: row.label,
        options: {
          fill: { color: bg },
          color: BRAND_COLORS.teal,
          bold: true,
          fontFace: BRAND_FONT_HEADING,
        },
      },
      { text: row.bebeyond, options: { fill: { color: bg }, color: BRAND_COLORS.textDark } },
      { text: row.competitors, options: { fill: { color: bg }, color: BRAND_COLORS.textMuted } },
    ];
  });

  slide.addTable([headerRow, ...bodyRows], {
    x: 0.6,
    y: 1.5,
    w: 12.13,
    h: 5.2,
    colW: [2.6, 4.76, 4.77],
    fontSize: 11,
    // Table-wide default is the body font (the description cells — row.bebeyond/row.competitors
    // — carry most of the table's actual copy); the header row and row.label cells above
    // override to the heading font per-cell since pptxgenjs table cells support their own
    // `options.fontFace`.
    fontFace: BRAND_FONT_BODY,
    border: { color: BRAND_COLORS.tealLight, pt: 0.5 },
    valign: 'middle',
    autoPage: false,
  });
}
