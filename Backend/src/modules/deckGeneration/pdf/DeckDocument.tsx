/**
 * Composes the 6-slide deck for one lead into a single <Document>. Originally mirrored the full
 * reference deck's structure (Docs/design-reference/pitch-deck-reference.pdf) and the old
 * pptxgenjs pipeline's buildDeckForLead (deckBuilder.ts) slide order, but has since been trimmed
 * down to the essentials: Cover, About Us, How Can We Help, Our Services, Major Wins, Thank You.
 *
 * Removed from this pipeline (deliberately, not an oversight): Our Story, Technology Solutions,
 * Creative Services, Why Choose Us, and How We Work. The legacy pptxgenjs slide/staticContent
 * that backed those (slides/{ourStorySlide,technologySolutionsSlide,serviceDeepDiveSlide,
 * whyChooseUsSlide,howWeWorkSlide}.ts, and staticContent.ts's OUR_STORY/TECHNOLOGY_SOLUTIONS/
 * SERVICE_DEEP_DIVE/WHY_CHOOSE_US/HOW_WE_WORK) stays in place unchanged — that dead pptxgenjs
 * pipeline still imports it, and AboutUsSlide.tsx still reuses WHY_CHOOSE_US's row labels for its
 * own differentiator tag strip. Same treatment as the earlier Success Stories removal.
 *
 * CoverSlide, HowCanWeHelpSlide, OurServicesSlide, and ThankYouSlide vary per lead (via ctx) —
 * every other slide is fully static, per the requirement to keep those sections constant across
 * every generated deck.
 */
import { Document } from '@react-pdf/renderer';
import type { DeckContext } from '../types.js';
import { CONTACT } from './theme.js';
import { AboutUsSlide } from './slides/AboutUsSlide.js';
import { CoverSlide } from './slides/CoverSlide.js';
import { HowCanWeHelpSlide } from './slides/HowCanWeHelpSlide.js';
import { MajorWinsSlide } from './slides/MajorWinsSlide.js';
import { OurServicesSlide } from './slides/OurServicesSlide.js';
import { ThankYouSlide } from './slides/ThankYouSlide.js';

/** Number of <Page> elements DeckDocument renders — kept in sync manually (checked by generateDeckPdf.ts's own page-count assertion) since react-pdf's Document doesn't expose a slide-count getter, mirroring how deckBuilder.ts's nextSlide() counted pptxgenjs .addSlide() calls. */
export const DECK_SLIDE_COUNT = 6;

export function DeckDocument({ ctx }: { ctx: DeckContext }) {
  return (
    <Document author={CONTACT.companyName} title={`${ctx.companyName} — ${CONTACT.companyName}`}>
      <CoverSlide ctx={ctx} />
      <AboutUsSlide />
      <HowCanWeHelpSlide ctx={ctx} />
      <OurServicesSlide ctx={ctx} />
      <MajorWinsSlide />
      <ThankYouSlide ctx={ctx} />
    </Document>
  );
}
