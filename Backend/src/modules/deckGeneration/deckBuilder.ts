import PptxGenJS from './pptxgenLoader.js';
import { SLIDE_HEIGHT_IN, SLIDE_WIDTH_IN } from './brand.js';
import { addAboutUsSlide } from './slides/aboutUsSlide.js';
import { addCoverSlide } from './slides/coverSlide.js';
import { addHowCanWeHelpSlide } from './slides/howCanWeHelpSlide.js';
import { addHowWeWorkSlide } from './slides/howWeWorkSlide.js';
import { addMajorWinsSlide } from './slides/majorWinsSlide.js';
import { addOurServicesSlide } from './slides/ourServicesSlide.js';
import { addOurStorySlide } from './slides/ourStorySlide.js';
import { addServiceDeepDiveSlide } from './slides/serviceDeepDiveSlide.js';
import { addSuccessStoriesSlide } from './slides/successStoriesSlide.js';
import { addTechnologySolutionsSlide } from './slides/technologySolutionsSlide.js';
import { addThankYouSlide } from './slides/thankYouSlide.js';
import { addWhyChooseUsSlide } from './slides/whyChooseUsSlide.js';
import type { DeckContext } from './types.js';

export const DECK_TEMPLATE_VERSION = 'v1';

/**
 * Assembles the full 12-slide deck for one lead, mirroring the reference deck's structure and
 * brand (NEW_PITCH_DECK.pdf). Only ourServicesSlide (category reorder/highlight), coverSlide,
 * and thankYouSlide vary per lead (see ctx) — everything else is identical across every deck,
 * per the requirement to keep static sections constant.
 */
export async function buildDeckForLead(ctx: DeckContext): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'BEBEYOND_WIDE', width: SLIDE_WIDTH_IN, height: SLIDE_HEIGHT_IN });
  pptx.layout = 'BEBEYOND_WIDE';
  pptx.author = 'BeBeyond Digital Solutions';
  pptx.title = `${ctx.companyName} — BeBeyond Digital Solutions`;

  addCoverSlide(pptx.addSlide(), ctx);
  addAboutUsSlide(pptx.addSlide());
  addOurStorySlide(pptx.addSlide());
  addSuccessStoriesSlide(pptx.addSlide());
  addHowCanWeHelpSlide(pptx.addSlide());
  addTechnologySolutionsSlide(pptx.addSlide());
  addOurServicesSlide(pptx.addSlide(), ctx);
  addServiceDeepDiveSlide(pptx.addSlide());
  addWhyChooseUsSlide(pptx.addSlide());
  addHowWeWorkSlide(pptx.addSlide());
  addMajorWinsSlide(pptx.addSlide());
  addThankYouSlide(pptx.addSlide(), ctx);

  const result = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.from(result as Uint8Array);
}
