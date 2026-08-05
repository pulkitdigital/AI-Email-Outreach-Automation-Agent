/** Per-lead values every personalized slide builder needs — deliberately minimal. */
export interface DeckContext {
  companyName: string;
  primaryCategorySlug: string | null;
  /**
   * Optional lead-provided industry, rendered as a short secondary line under "Prepared for
   * {companyName}" on the cover slide (pdf/slides/CoverSlide.tsx) when present. Often null —
   * that line simply doesn't render rather than showing a fabricated placeholder.
   */
  industry: string | null;
}
