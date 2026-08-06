/**
 * Brand constants verified directly against the real reference file
 * (Docs/design-reference/pitch-deck-reference.pdf, 13 pages, 1440x810pt) using pdfplumber —
 * vector fill colors and character fill colors were sampled and hex-converted across the whole
 * deck, not eyeballed off a logo asset. The two dominant solid fills are #FB8500 (882+ character
 * occurrences) and #219EBC, so those remain the canonical brand colors; `tealShape`, `tealPale`,
 * `palerBlue`, `cream`, `navy`, and `textMuted` below were previously approximated/guessed and
 * have now been corrected (or newly added) to their verified exact values.
 *
 * pptxgenjs wants hex strings WITHOUT a leading '#' — that's why these stay bare hex rather than
 * CSS-style '#RRGGBB'. The react-pdf pipeline (pdf/theme.ts) re-exports these with a '#' prefix
 * for its own use rather than changing the format here, so the pptxgenjs slide builders (still
 * present, just unwired — see deckGenerationService.ts) keep compiling unchanged.
 */
export const BRAND_COLORS = {
  /** Dominant brand orange — headings, emphasis, borders, badges, bold body text. */
  orange: 'FB8500',
  /** Dominant brand teal — headings/wordmark text ("Beyond", section headings like "About Us"). */
  teal: '219EBC',
  /** Distinct, slightly muted/darker teal used specifically for shape fills (e.g. the underline bar beneath section headings like "Success Stories"/"Major Wins") — genuinely different from `teal`, not a rounding artifact. */
  tealShape: '2793AD',
  /** Pixel-sampled light accent from the logo mark (not separately re-verified against the reference PDF; kept for the one existing consumer, whyChooseUsSlide.ts's table border). */
  tealLight: '90CFDE',
  /** Pale teal tint background. */
  tealPale: 'CBF3F0',
  /** Secondary pale-blue tint background — use for an alternate card/section background distinct from tealPale/cream. */
  palerBlue: 'E5F2FF',
  /** Warm off-white card background — e.g. the "About Us" card (cream fill, ~4pt orange border, ~24pt corner radius). */
  cream: 'FFF8F0',
  /** Dark navy — available as a dark accent if a component needs a dark background/text variant; not forced in anywhere it isn't needed. */
  navy: '002357',
  black: '000000',
  textDark: '2B2B2B',
  textMuted: '545454',
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
 *
 * This limitation also applies to the server-side .pptx -> .pdf conversion (pptxToPdf.ts,
 * production only): the Render worker's LibreOffice install (render.yaml) does NOT include
 * either font — neither is an apt-installable Debian/Ubuntu package, and downloading font files
 * from a third-party repo into every production build was judged too fragile for the payoff (see
 * render.yaml's comment for the full reasoning) — so LibreOffice substitutes its own fallback
 * (typically Liberation Sans, which render.yaml installs explicitly so the substitution is at
 * least a clean, well-hinted font rather than whatever happens to be present) when rendering the
 * PDF that actually gets attached and emailed to leads. This is an accepted trade-off, not an
 * oversight: every slide's copy is fixed, previously-tuned static text (staticContent.ts)
 * EXCEPT the lead's company name (coverSlide.ts, thankYouSlide.ts), which is the one place a
 * substituted font's different character widths could plausibly push text past its box — those
 * two text boxes use pptxgenjs's `fit: 'shrink'` specifically to absorb that risk.
 */
export const BRAND_FONT_HEADING = 'Bricolage Grotesque';
export const BRAND_FONT_BODY = 'Public Sans';

export const BRAND_CONTACT = {
  companyName: 'BeBeyond Digital Solutions',
  tagline: 'One Stop Solution For All Your Digital Needs',
  email: 'info@bebeyond.digital',
  phone: '+91 99 1867 1867',
  address: 'Chamber 6, 4th Floor, Sangam Place, Prayagraj, U.P, India - 211003',
  website: 'https://www.bebeyond.digital/',
  websiteLabel: 'www.bebeyond.digital',
} as const;

/** 13.33x7.5in — pptxgenjs's native 16:9 "LAYOUT_WIDE", matching the reference deck's widescreen slides. */
export const SLIDE_WIDTH_IN = 13.33;
export const SLIDE_HEIGHT_IN = 7.5;
