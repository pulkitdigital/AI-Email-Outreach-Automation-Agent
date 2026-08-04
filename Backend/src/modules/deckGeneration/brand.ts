/**
 * Brand constants extracted from the reference deck (NEW_PITCH_DECK.pdf, provided 2026-07-31)
 * and pixel-sampled from its accompanying logo asset (Pitch Deck Design.png) — the two solid
 * fills accounting for the vast majority of non-white pixels are #FB8500 and #219EBC, so those
 * are treated as the canonical brand colors rather than the "-ish" values initially proposed.
 * Tints/pale backgrounds below are visual approximations (the reference deck's page
 * backgrounds weren't separately pixel-sampled) — flagged here so they're easy to correct.
 *
 * pptxgenjs wants hex strings WITHOUT a leading '#'.
 */
export const BRAND_COLORS = {
  orange: 'FB8500',
  teal: '219EBC',
  /** Pixel-sampled light accent from the logo mark. */
  tealLight: '90CFDE',
  /** Pixel-sampled pale tint from the logo mark — used for soft card/section backgrounds. */
  tealPale: 'C8E7EF',
  /** Approximate warm off-white seen behind the About Us / How Can We Help cards. */
  cream: 'FFF8EF',
  textDark: '2B2B2B',
  textMuted: '5A5A5A',
  white: 'FFFFFF',
} as const;

/**
 * Heading font (slide titles, section/card headers) and body font (paragraphs, bullet points,
 * service descriptions) per the 2026-08-04 brand update.
 *
 * LIMITATION: pptxgenjs writes only the font NAME into the .pptx XML — it has no support for
 * embedding the actual TTF/OTF font file into the archive's fonts.xml/font table. Neither
 * "Bricolage Grotesque" nor "Public Sans" ship with Windows/macOS/Office by default, so the
 * deck renders as intended only on a machine that already has both installed (e.g. via Google
 * Fonts). Everywhere else, PowerPoint/Google Slides/Keynote silently substitute their own
 * default (this is standard OOXML behavior, not a rendering error — the file still opens and
 * is never corrupted). True embedding would require a post-processing step that unzips the
 * generated .pptx, injects the font binaries + a ppt/fontTable relationship, and rezips it —
 * evaluated and not worth the complexity/fragility for this deck (see deckGenerationService.ts
 * for where that step would slot in, if ever needed); recipients who need pixel-exact
 * typography should install both fonts locally.
 */
export const BRAND_FONT_HEADING = 'Bricolage Grotesque';
export const BRAND_FONT_BODY = 'Public Sans';

export const BRAND_CONTACT = {
  companyName: 'BeBeyond Digital Solutions',
  tagline: 'One Stop Solution For All Your Digital Needs',
  email: 'info@bebeyond.digital',
  phone: '+91 99 1867 1867',
  address: 'Chamber 6, 4th Floor, Sangam Place, Prayagraj, U.P, India - 211003',
} as const;

/** 13.33x7.5in — pptxgenjs's native 16:9 "LAYOUT_WIDE", matching the reference deck's widescreen slides. */
export const SLIDE_WIDTH_IN = 13.33;
export const SLIDE_HEIGHT_IN = 7.5;
