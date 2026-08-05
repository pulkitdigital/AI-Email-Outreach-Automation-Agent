/**
 * Single shared design-token module for the react-pdf deck pipeline — every slide component
 * imports colors/fonts/spacing from here rather than hardcoding hex values or magic numbers, so
 * the whole deck stays visually consistent and correctable from one place.
 *
 * Colors are re-exported from brand.ts (the source of truth, shared with the still-present but
 * now-unwired pptxgenjs pipeline) with a '#' prefix added — brand.ts deliberately keeps bare hex
 * because pptxgenjs requires that format, while react-pdf (like any CSS-flavored renderer) expects
 * standard '#RRGGBB' strings.
 */
import { BRAND_COLORS, BRAND_CONTACT, BRAND_FONT_BODY, BRAND_FONT_HEADING } from '../brand.js';

function hash<T extends Record<string, string>>(colors: T): { [K in keyof T]: string } {
  return Object.fromEntries(
    Object.entries(colors).map(([key, value]) => [key, `#${value}`]),
  ) as { [K in keyof T]: string };
}

export const COLORS = hash(BRAND_COLORS);

export const FONT_HEADING = BRAND_FONT_HEADING;
export const FONT_BODY = BRAND_FONT_BODY;

export const CONTACT = BRAND_CONTACT;

/**
 * 1440x810pt — exactly the reference deck's Canva 16:9 export size (verified via pdfplumber
 * page.width/height against Docs/design-reference/pitch-deck-reference.pdf), NOT A4. Every
 * slide's card-grid layout is built around these dimensions.
 */
export const PAGE_WIDTH = 1440;
export const PAGE_HEIGHT = 810;

/** Consistent spacing scale (points) used across every slide instead of ad-hoc magic numbers. */
export const SPACING = {
  xs: 6,
  sm: 12,
  md: 20,
  lg: 32,
  xl: 48,
  xxl: 64,
} as const;

/** Outer page margin every slide's content respects, matching the reference deck's generous edge padding. */
export const PAGE_MARGIN = 64;

/** Shared corner radius for cards (the reference's "About Us" card measured ~24pt). */
export const CARD_RADIUS = 24;
