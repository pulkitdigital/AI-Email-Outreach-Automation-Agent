<<<<<<< HEAD
import { BRAND_COLORS, BRAND_FONT_BODY } from '../brand.js';
=======
import { BRAND_COLORS, BRAND_FONT } from '../brand.js';
>>>>>>> 8e37ccd7b7ac19849c4ba3b08a803cc49cbe28f7
import { SUCCESS_STORY_CLIENTS } from '../staticContent.js';
import { addSlideTitle, type Slide } from './cardHelpers.js';

/**
 * Reference deck page 4 ("Success Stories") — shows actual client logos in the original.
 * Rendered here as a name badge grid instead: no logo image assets were available to embed
 * losslessly. Fully static.
 */
export function addSuccessStoriesSlide(slide: Slide): void {
  slide.background = { color: BRAND_COLORS.white };
  addSlideTitle(slide, [{ text: 'Success Stories', color: BRAND_COLORS.teal }]);

  const cols = 4;
  const badgeW = 2.9;
  const badgeH = 0.6;
  const gapX = 0.15;
  const gapY = 0.18;
  const startX = 0.6;
  const startY = 1.7;

  SUCCESS_STORY_CLIENTS.slice(0, 16).forEach((client, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (badgeW + gapX);
    const y = startY + row * (badgeH + gapY);
    const accent = i % 2 === 0 ? BRAND_COLORS.teal : BRAND_COLORS.orange;

    slide.addShape('roundRect', {
      x,
      y,
      w: badgeW,
      h: badgeH,
      rectRadius: 0.3,
      fill: { color: BRAND_COLORS.tealPale },
      line: { color: accent, width: 1 },
    });
    slide.addText(client, {
      x: x + 0.1,
      y,
      w: badgeW - 0.2,
      h: badgeH,
      fontSize: 11,
      bold: true,
      color: BRAND_COLORS.textDark,
<<<<<<< HEAD
      fontFace: BRAND_FONT_BODY,
=======
      fontFace: BRAND_FONT,
>>>>>>> 8e37ccd7b7ac19849c4ba3b08a803cc49cbe28f7
      align: 'center',
      valign: 'middle',
    });
  });
}
