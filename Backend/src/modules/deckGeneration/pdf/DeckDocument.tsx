/**
 * Composes the full 12-slide deck for one lead into a single <Document>, mirroring the reference
 * deck's structure/order (Docs/design-reference/pitch-deck-reference.pdf) and the old pptxgenjs
 * pipeline's buildDeckForLead (deckBuilder.ts) slide order — kept identical so nothing about "what
 * slide comes when" changed in this migration, only how each slide is rendered.
 *
 * Only CoverSlide, OurServicesSlide, and ThankYouSlide vary per lead (via ctx) — every other slide
 * is fully static, per the requirement to keep those sections constant across every generated deck.
 */
import { Document } from '@react-pdf/renderer';
import type { DeckContext } from '../types.js';
import { CONTACT } from './theme.js';
import { AboutUsSlide } from './slides/AboutUsSlide.js';
import { CoverSlide } from './slides/CoverSlide.js';
import { HowCanWeHelpSlide } from './slides/HowCanWeHelpSlide.js';
import { HowWeWorkSlide } from './slides/HowWeWorkSlide.js';
import { MajorWinsSlide } from './slides/MajorWinsSlide.js';
import { OurServicesSlide } from './slides/OurServicesSlide.js';
import { OurStorySlide } from './slides/OurStorySlide.js';
import { ServiceDeepDiveSlide } from './slides/ServiceDeepDiveSlide.js';
import { SuccessStoriesSlide } from './slides/SuccessStoriesSlide.js';
import { TechnologySolutionsSlide } from './slides/TechnologySolutionsSlide.js';
import { ThankYouSlide } from './slides/ThankYouSlide.js';
import { WhyChooseUsSlide } from './slides/WhyChooseUsSlide.js';

/** Number of <Page> elements DeckDocument renders — kept in sync manually (checked by generateDeckPdf.ts's own page-count assertion) since react-pdf's Document doesn't expose a slide-count getter, mirroring how deckBuilder.ts's nextSlide() counted pptxgenjs .addSlide() calls. */
export const DECK_SLIDE_COUNT = 12;

export function DeckDocument({ ctx }: { ctx: DeckContext }) {
  return (
    <Document author={CONTACT.companyName} title={`${ctx.companyName} — ${CONTACT.companyName}`}>
      <CoverSlide ctx={ctx} />
      <AboutUsSlide />
      <OurStorySlide />
      <SuccessStoriesSlide />
      <HowCanWeHelpSlide />
      <TechnologySolutionsSlide />
      <OurServicesSlide ctx={ctx} />
      <ServiceDeepDiveSlide />
      <WhyChooseUsSlide />
      <HowWeWorkSlide />
      <MajorWinsSlide />
      <ThankYouSlide ctx={ctx} />
    </Document>
  );
}
