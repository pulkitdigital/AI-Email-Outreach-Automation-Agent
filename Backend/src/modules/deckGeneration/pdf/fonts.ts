/**
 * Registers the deck's two brand fonts (Bricolage Grotesque for headings, Public Sans for body —
 * see brand.ts's BRAND_FONT_HEADING/BRAND_FONT_BODY) with @react-pdf/renderer's font store, using
 * real on-disk .woff files shipped inside @fontsource/bricolage-grotesque and
 * @fontsource/public-sans (Backend/package.json dependencies).
 *
 * WHY @fontsource rather than curling font files from a GitHub raw URL: that exact anti-pattern
 * was already evaluated and rejected for the old LibreOffice/pptxgenjs pipeline (see brand.ts's
 * and render.yaml's own comments) — a live network dependency in the production build that breaks
 * silently if a third-party repo ever moves a path. @fontsource packages ship the actual static
 * font files as real npm dependency content, so Font.register below points at a file that's
 * physically present in node_modules at build time and require time, with zero runtime network
 * calls (@react-pdf/font's loader only fetches over HTTP when `src` is a URL — a local absolute
 * path goes straight to fontkit.open(), pure filesystem read).
 *
 * WHY .woff not .woff2: fontkit (react-pdf's font parser) supports both, but .woff needs no
 * additional Brotli-decompression step — a strictly safer choice for a server-side renderer that
 * must never fail on a missing/broken codec. Both packages ship both formats; .woff is chosen
 * deliberately, not just "whichever came first."
 *
 * WHY only these specific files, not `import '@fontsource/.../index.css'`: the CSS entrypoint
 * pulls in (as far as bundlers are concerned) the full set of weights/subsets the package ships —
 * for Bricolage Grotesque that's 7 weights x 3 subsets (latin, latin-ext, vietnamese), and this
 * deck only ever renders Latin text in a handful of weights. Font.register below references only
 * the individual .woff files actually used, so the generated PDF embeds only those subsets rather
 * than however many the npm package happens to ship — keeping output file size proportional to
 * what's actually drawn, not to the font vendor's full release.
 */
import { createRequire } from 'node:module';
import { Font } from '@react-pdf/renderer';
import { BRAND_FONT_BODY, BRAND_FONT_HEADING } from '../brand.js';

const require = createRequire(import.meta.url);

/** Resolves one @fontsource static file to its absolute on-disk path (throws if the package's internal file layout ever changes — fail loudly at import time, not with a silently blank PDF). */
function fontsourceFile(pkg: string, file: string): string {
  return require.resolve(`${pkg}/files/${file}`);
}

let registered = false;

/**
 * Idempotent — Font.register merely overwrites the same family entry on repeat calls, but every
 * slide module would otherwise need to remember to call this exactly once; callers (generateDeckPdf.ts)
 * just call it unconditionally before every render.
 */
export function registerDeckFonts(): void {
  if (registered) return;
  registered = true;

  Font.register({
    family: BRAND_FONT_HEADING,
    fonts: [
      {
        src: fontsourceFile(
          '@fontsource/bricolage-grotesque',
          'bricolage-grotesque-latin-400-normal.woff',
        ),
        fontWeight: 400,
      },
      {
        src: fontsourceFile(
          '@fontsource/bricolage-grotesque',
          'bricolage-grotesque-latin-600-normal.woff',
        ),
        fontWeight: 600,
      },
      {
        src: fontsourceFile(
          '@fontsource/bricolage-grotesque',
          'bricolage-grotesque-latin-700-normal.woff',
        ),
        fontWeight: 700,
      },
      {
        src: fontsourceFile(
          '@fontsource/bricolage-grotesque',
          'bricolage-grotesque-latin-800-normal.woff',
        ),
        fontWeight: 800,
      },
    ],
  });

  Font.register({
    family: BRAND_FONT_BODY,
    fonts: [
      {
        src: fontsourceFile('@fontsource/public-sans', 'public-sans-latin-400-normal.woff'),
        fontWeight: 400,
      },
      {
        src: fontsourceFile('@fontsource/public-sans', 'public-sans-latin-500-normal.woff'),
        fontWeight: 500,
      },
      {
        src: fontsourceFile('@fontsource/public-sans', 'public-sans-latin-700-normal.woff'),
        fontWeight: 700,
      },
      // Italic — needed because the Major Wins / Thank You slides render fontStyle: 'italic'
      // text in this family. react-pdf's font resolver does NOT fall back from italic to normal
      // when no italic face is registered (it throws "Could not resolve font" instead), unlike
      // its more forgiving nearest-weight fallback — so this face must be registered explicitly.
      {
        src: fontsourceFile('@fontsource/public-sans', 'public-sans-latin-400-italic.woff'),
        fontWeight: 400,
        fontStyle: 'italic',
      },
    ],
  });

  // react-pdf hyphenates by default (breaks long words across lines) using a naive built-in
  // algorithm that isn't aware of brand names/URLs in this deck's copy (e.g. "BeBeyond",
  // "info@bebeyond.digital") — disable it so those never get an unexpected mid-word break.
  Font.registerHyphenationCallback((word) => [word]);
}
