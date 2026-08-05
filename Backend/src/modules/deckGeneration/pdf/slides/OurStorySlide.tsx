/**
 * Reference deck page 3 ("Our Story") — the reference shows a circular founder-journey diagram;
 * rendered here as a simple numbered list instead (circular layouts are impractical in react-pdf's
 * flexbox-driven layout engine), each step with its number badge, title, and body paragraph.
 */
import { Page, Text, View } from '@react-pdf/renderer';
import { NumberBadge, SlideBody, SlideTitle } from '../components.js';
import { OUR_STORY } from '../../staticContent.js';
import { COLORS, FONT_BODY, FONT_HEADING, PAGE_HEIGHT, PAGE_WIDTH, SPACING } from '../theme.js';

export function OurStorySlide() {
  return (
    <Page size={[PAGE_WIDTH, PAGE_HEIGHT]}>
      <SlideBody>
        <SlideTitle
          parts={[
            { text: 'Our ', color: COLORS.teal },
            { text: 'Story', color: COLORS.orange },
          ]}
        />
        <View style={{ flexDirection: 'column', gap: SPACING.sm }}>
          {OUR_STORY.map((step, i) => {
            const accent = i % 2 === 0 ? COLORS.teal : COLORS.orange;
            return (
              <View key={step.step} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md }}>
                <NumberBadge number={step.step} color={accent} size={30} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 14, color: accent }}>
                    {step.title}
                  </Text>
                  <Text
                    style={{
                      marginTop: 3,
                      fontFamily: FONT_BODY,
                      fontWeight: 400,
                      fontSize: 11.5,
                      lineHeight: 1.35,
                      color: COLORS.textDark,
                    }}
                  >
                    {step.body}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </SlideBody>
    </Page>
  );
}
