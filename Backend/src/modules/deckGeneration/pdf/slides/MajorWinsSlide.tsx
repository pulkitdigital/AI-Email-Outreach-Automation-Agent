/**
 * Reference deck page 13 ("Major Wins") — 3 testimonial quote-cards, each with a decorative
 * quote-mark icon (matching the card treatment used on About Us), 5 inline SVG stars, quote
 * text, and attribution — no screenshot images.
 */
import { Page, Text, View } from '@react-pdf/renderer';
import { SlideBody, SlideTitle } from '../components.js';
import { QuoteIcon, StarRow } from '../icons.js';
import { TESTIMONIALS } from '../../staticContent.js';
import { CARD_GAP, COLORS, FONT_BODY, PAGE_HEIGHT, PAGE_MARGIN, PAGE_WIDTH, SPACING } from '../theme.js';

export function MajorWinsSlide() {
  const cardWidth =
    (PAGE_WIDTH - 2 * PAGE_MARGIN - (TESTIMONIALS.length - 1) * CARD_GAP.md) / TESTIMONIALS.length;

  return (
    <Page size={[PAGE_WIDTH, PAGE_HEIGHT]}>
      <SlideBody>
        <SlideTitle parts={[{ text: 'Major Wins', color: COLORS.teal }]} />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', gap: CARD_GAP.lg, alignItems: 'stretch' }}>
            {TESTIMONIALS.map((testimonial, i) => {
              const accent = i % 2 === 0 ? COLORS.teal : COLORS.orange;
              return (
                <View
                  key={testimonial.attribution}
                  style={{
                    width: cardWidth,
                    minHeight: 360,
                    padding: SPACING.lg,
                    borderRadius: 16,
                    borderWidth: 1.25,
                    borderColor: accent,
                    backgroundColor: COLORS.cream,
                    flexDirection: 'column',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <QuoteIcon size={40} color={accent} />
                    <StarRow size={16} color={COLORS.orange} />
                  </View>
                  <Text
                    style={{
                      marginTop: SPACING.lg,
                      fontFamily: FONT_BODY,
                      fontWeight: 400,
                      fontStyle: 'italic',
                      fontSize: 13,
                      lineHeight: 1.55,
                      color: COLORS.textDark,
                    }}
                  >
                    “{testimonial.quote}”
                  </Text>
                  <View style={{ flex: 1 }} />
                  <View style={{ marginTop: SPACING.md, height: 1.5, backgroundColor: accent, opacity: 0.3 }} />
                  <Text
                    style={{
                      marginTop: SPACING.sm,
                      fontFamily: FONT_BODY,
                      fontWeight: 700,
                      fontSize: 12.5,
                      color: accent,
                    }}
                  >
                    — {testimonial.attribution}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </SlideBody>
    </Page>
  );
}
