/** Reference deck page 13 ("Major Wins") — 3 testimonial quote-cards, each with 5 inline SVG stars, quote text, and attribution — no screenshot images. */
import { Page, Text, View } from '@react-pdf/renderer';
import { SlideBody, SlideTitle } from '../components.js';
import { StarRow } from '../icons.js';
import { TESTIMONIALS } from '../../staticContent.js';
import { COLORS, FONT_BODY, PAGE_HEIGHT, PAGE_WIDTH, SPACING } from '../theme.js';

const GAP = 20;

export function MajorWinsSlide() {
  const cardWidth = (PAGE_WIDTH - 2 * 64 - (TESTIMONIALS.length - 1) * GAP) / TESTIMONIALS.length;

  return (
    <Page size={[PAGE_WIDTH, PAGE_HEIGHT]}>
      <SlideBody>
        <SlideTitle parts={[{ text: 'Major Wins', color: COLORS.teal }]} />
        <View style={{ flexDirection: 'row', gap: GAP }}>
          {TESTIMONIALS.map((testimonial, i) => {
            const accent = i % 2 === 0 ? COLORS.teal : COLORS.orange;
            return (
              <View
                key={testimonial.attribution}
                style={{
                  width: cardWidth,
                  padding: 20,
                  borderRadius: 14,
                  borderWidth: 1.25,
                  borderColor: accent,
                  backgroundColor: COLORS.cream,
                  flexDirection: 'column',
                }}
              >
                <StarRow size={13} color={COLORS.orange} />
                <Text
                  style={{
                    marginTop: SPACING.sm,
                    fontFamily: FONT_BODY,
                    fontWeight: 400,
                    fontStyle: 'italic',
                    fontSize: 10.5,
                    lineHeight: 1.4,
                    color: COLORS.textDark,
                  }}
                >
                  “{testimonial.quote}”
                </Text>
                <Text
                  style={{
                    marginTop: SPACING.sm,
                    fontFamily: FONT_BODY,
                    fontWeight: 700,
                    fontSize: 10.5,
                    color: accent,
                  }}
                >
                  — {testimonial.attribution}
                </Text>
              </View>
            );
          })}
        </View>
      </SlideBody>
    </Page>
  );
}
