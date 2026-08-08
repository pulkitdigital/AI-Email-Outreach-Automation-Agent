/**
 * Copy extracted verbatim from the reference deck (NEW_PITCH_DECK.pdf, provided 2026-07-31).
 * Everything here is identical across every generated deck, per the requirement to keep static
 * sections constant — only the slides in slides/ourServicesSlide.ts, coverSlide.ts, and
 * thankYouSlide.ts vary per lead.
 */

export const ABOUT_US = {
  eyebrow: 'Forget the typical agency model.',
  body: "At Be Beyond, we're your digital partner—part of your team, invested in your growth. We think, plan, and build with you to create strategies that truly deliver.",
};

export interface StoryStep {
  step: number;
  title: string;
  body: string;
}

/**
 * Reference deck page 3 ("Our Story"), simplified from its circular diagram to a numbered grid —
 * see Docs/ARCHITECTURE.md § 3 Deck Generation Layer for why. The dedicated Our Story slide was
 * later removed from the react-pdf deck; this array is kept only for the legacy pptxgenjs
 * slides/ourStorySlide.ts, which still imports it.
 */
export const OUR_STORY: StoryStep[] = [
  {
    step: 1,
    title: 'Where It All Started',
    body: 'I started my career at a top ed-tech company, where I learned digital marketing that drives real results—not just theory.',
  },
  {
    step: 2,
    title: 'The Creative Spark',
    body: 'Over time, I was drawn to motion graphics and visuals that grab attention and spark emotion.',
  },
  {
    step: 3,
    title: 'Getting My Hands on E-commerce',
    body: 'I managed Shopify stores end-to-end, ensuring a seamless customer journey from browsing to checkout.',
  },
  {
    step: 4,
    title: 'Learning What Really Connects',
    body: 'I crafted email, SMS, and WhatsApp campaigns that connect with real people—not just chase metrics.',
  },
  {
    step: 5,
    title: 'Starting BeBeyond',
    body: 'In 2024, I started BeBeyond Digital Solutions to make marketing creative, reliable, and genuinely connected.',
  },
  {
    step: 6,
    title: 'What We Truly Believe',
    body: 'At BeBeyond, we do more than run campaigns — we walk with you, turning your story into clear, impactful words that truly connect.',
  },
];

/**
 * Client names from the "Success Stories" slide (page 4 of the real reference,
 * Docs/design-reference/pitch-deck-reference.pdf), visually read off the deck's 27-logo grid in
 * its own row-by-row reading order — without those logo image assets, names are rendered as a
 * typographic name grid instead (pdf/slides/SuccessStoriesSlide.tsx). Logos with no legible
 * company name (an unlabeled purple network icon, a "TB" monogram-only mark, an unlabeled orange
 * "C" circle, and an unlabeled gradient "SC" circle) are deliberately excluded rather than
 * guessed. This list replaces an earlier, incomplete 18-name extraction (which also misspelled
 * "Ttapio Cafe" as "Tiapio Cafe") — verified accurate as of 2026-08-05.
 */
export const SUCCESS_STORY_CLIENTS: string[] = [
  'Sajit by C Anupama',
  'SSCO',
  'Sappy So Happy!',
  'The Celeste Chic & Co',
  'JNAB',
  'Utkarsh Singhal Law Offices',
  'First Print Publications',
  'JW',
  'ZebraLearn',
  'DataGOL',
  'Scanner Adda',
  'Kazaru Installations + Art',
  'KayPee Dies (Since 1968)',
  'Ttapio Cafe',
  'Indi Genius Matters',
  'The Woods Living',
  'Whimsical Tides',
  'NAC – National Academy of Commerce',
  'Venus (A Taste of Home)',
  'M Uniforms',
  'SkyPro Aviation',
  'Navli Jewellers',
  'Amber',
];

export interface IconColumn {
  title: string;
  items: string[];
}

/** Page 5 ("How Can We Help?") — 8 benefit cards. */
export const HOW_CAN_WE_HELP: string[] = [
  'Increased Visibility',
  'Streamlined Processes',
  'Optimized Marketing Spend',
  'Confidence and Trust',
  'Sense of Achievement',
  'Peace of Mind',
  'Excitement for Growth',
  'Competitive Advantage',
];

/**
 * Maps each service category (serviceCatalog.ts's SERVICE_CATEGORIES slugs) to the 2-3
 * HOW_CAN_WE_HELP benefits most relevant to it — judgment-based matching of each benefit's actual
 * meaning to each category's services, not verbatim reference content (every label still comes
 * from HOW_CAN_WE_HELP itself, nothing invented). Used by orderBenefitsForLead() below to
 * personalize the "How Can We Help?" slide the same way orderCategoriesForLead() personalizes
 * "Our Services".
 *
 * - Digital Marketing (SMM/SEO/GMB/performance marketing) → visibility, ad-spend efficiency, growth.
 * - Web & App Solutions (websites/apps/automation) → operational efficiency, credibility, an edge over competitors.
 * - Creative Services (branding/design/video) → pride in the output, a more trustworthy brand image, more engagement.
 * - Marketplace & Commerce (Amazon/Flipkart/Meesho/Myntra listings) → one less thing to worry about, a new growth channel, staying ahead of competitors already selling there.
 */
export const HOW_CAN_WE_HELP_BY_CATEGORY: Record<string, string[]> = {
  'digital-marketing': ['Increased Visibility', 'Optimized Marketing Spend', 'Excitement for Growth'],
  'web-app-solutions': ['Streamlined Processes', 'Confidence and Trust', 'Competitive Advantage'],
  'creative-services': ['Sense of Achievement', 'Confidence and Trust', 'Increased Visibility'],
  'marketplace-commerce': ['Peace of Mind', 'Excitement for Growth', 'Competitive Advantage'],
};

/**
 * Moves the benefits mapped to the lead's primary category (benefitsByCategory — defaults to this
 * module's own HOW_CAN_WE_HELP_BY_CATEGORY, but pdf/slides/HowCanWeHelpSlide.tsx now passes the
 * DB-sourced ctx.howCanWeHelpByCategory instead, see pdf/generateDeckPdf.ts) to the front of the
 * grid, in that mapping's own relevance order, while preserving the relative order of everything
 * else — mirrors serviceCatalog.ts's orderCategoriesForLead() pattern (which already took its
 * category list as an explicit parameter; this one only gained the equivalent parameter now, for
 * the same DB-migration reason). The default parameter keeps every existing 2-argument call
 * (including this file's own tests) behaviorally unchanged. Pure function, unit-testable without
 * touching react-pdf at all, with the same graceful degradation (an unrecognized/missing category,
 * or a mapping that doesn't actually match any real benefit label, returns the original order
 * unchanged rather than crashing or silently dropping items).
 */
export function orderBenefitsForLead(
  benefits: string[],
  primaryCategorySlug: string | null,
  benefitsByCategory: Record<string, string[]> = HOW_CAN_WE_HELP_BY_CATEGORY,
): string[] {
  if (!primaryCategorySlug) return benefits;

  const relevant = benefitsByCategory[primaryCategorySlug];
  if (!relevant || relevant.length === 0) return benefits;

  const front = relevant.filter((label) => benefits.includes(label));
  if (front.length === 0) return benefits;

  const frontSet = new Set(front);
  const rest = benefits.filter((label) => !frontSet.has(label));
  return [...front, ...rest];
}

/**
 * Page 6 ("Technology Solutions") — 3 columns. The dedicated Technology Solutions slide was later
 * removed from the react-pdf deck; this array is kept only for the legacy pptxgenjs
 * slides/technologySolutionsSlide.ts, which still imports it.
 */
export const TECHNOLOGY_SOLUTIONS: IconColumn[] = [
  { title: 'Web Development', items: ['Business Sites', 'E-commerce', 'Landing Pages'] },
  { title: 'App Development', items: ['Android & iOS', 'Flutter Apps', 'UI/UX Design'] },
  { title: 'AI Bot', items: ['AI Chatbots', 'Automation', 'CRM Integration'] },
];

/** Page 7 ("Our Services") subtitle, verbatim from the reference. */
export const OUR_SERVICES_SUBTITLE = 'Technology, Marketing & Creative Solutions';

export interface ServiceDeepDiveItem {
  title: string;
  body: string;
}

/**
 * The reference deck actually has TWO near-duplicate "Creative Services" pages (8 and 9). Page 9
 * is the one captured here verbatim (5 cards: SEO, PPC, SMM, Email Marketing, WhatsApp
 * Marketing) — its content is used for the merged "Creative Services detail" slide per the
 * original task brief's instruction to combine the two. Page 8's more granular 3-column
 * breakdown (Social Media Marketing / Performance Marketing / SEO & Analytics sub-items) is
 * superseded by that merge and intentionally NOT built as a 13th slide — it exists in the
 * reference PDF if it's ever wanted later, but isn't reproduced here.
 *
 * The dedicated Creative Services slide was later removed from the react-pdf deck; this array is
 * kept only for the legacy pptxgenjs slides/serviceDeepDiveSlide.ts, which still imports it.
 */
export const SERVICE_DEEP_DIVE: ServiceDeepDiveItem[] = [
  { title: 'Search Engine Optimization', body: 'Improve visibility and rank higher.' },
  { title: 'Pay Per Click', body: 'Drive instant targeted traffic.' },
  { title: 'Social Media Marketing', body: 'Boost reach and engagement.' },
  { title: 'Email Marketing', body: 'Nurture leads and drive conversions.' },
  { title: 'WhatsApp Marketing', body: 'Connect directly with customers.' },
];

export interface ComparisonRow {
  label: string;
  bebeyond: string;
  competitors: string;
}

/**
 * Page 11 ("Why Choose Us?") — comparison table, verbatim. The dedicated Why Choose Us slide was
 * later removed from the react-pdf deck, but this array is still used by AboutUsSlide.tsx (row
 * labels reused as a short differentiator tag strip) and by the legacy pptxgenjs
 * slides/whyChooseUsSlide.ts — kept for both.
 */
export const WHY_CHOOSE_US: ComparisonRow[] = [
  {
    label: 'Real Results, No Hype',
    bebeyond: 'No false claims — only transparent, data-backed outcomes.',
    competitors: 'Bold promises with no performance guarantee.',
  },
  {
    label: 'Clear Pricing',
    bebeyond: 'One upfront fee. No hidden costs, ever.',
    competitors: 'Hidden charges and unclear billing structures.',
  },
  {
    label: 'Full Transparency',
    bebeyond: 'Honest updates, open communication, no hidden agendas.',
    competitors: 'Vague progress reports, lack of clarity in work.',
  },
  {
    label: 'Smart Budget Allocation',
    bebeyond: 'Strategic guidance to maximize every rupee of your digital spend.',
    competitors: 'Poor planning, misaligned budget utilization.',
  },
  {
    label: 'Long-Term Support',
    bebeyond: 'Support continues even after project completion — we build relationships.',
    competitors: 'Limited support post-project; transactional approach.',
  },
];

/**
 * Page 12 ("How We Work") — verbatim. The dedicated How We Work slide was later removed from the
 * react-pdf deck; this array is kept only for the legacy pptxgenjs slides/howWeWorkSlide.ts,
 * which still imports it.
 */
export const HOW_WE_WORK: string[] = [
  'We partner with you to build long-term success.',
  'Client collaboration is highly valued.',
  'Work shared after completion, limited revisions for efficiency.',
  'Working Hours: 10:00 AM - 6:00 PM (Monday to Saturday)',
  'Messages are welcome anytime; we respond according to urgency.',
];

export interface Testimonial {
  quote: string;
  attribution: string;
}

/** Page 13 ("Major Wins") — trimmed excerpts of the reviews shown (screenshots in the source). */
export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'I have had an incredible experience working with Be Beyond Digital Solutions. Their team is not only professional but also extremely friendly and easy to work with... every project of mine is now handled by Beyond Digital Solutions.',
    attribution: 'Tanisha Jindal',
  },
  {
    quote:
      "We've had a fantastic experience working with Be Beyond Digital Solutions for our hotel Ganga River Front. From the very beginning, their team has been professional, proactive, and results-driven.",
    attribution: 'Abhijeet Kumar — Ganga RiverFront Rooms & Banquet, Prayagraj',
  },
  {
    quote:
      'Their expertise in website building is unmatched, and they go above and beyond to assist with everything else you need. Highly recommended.',
    attribution: 'Sherry Gupta',
  },
];
