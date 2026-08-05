/** Reference deck page 12 ("How We Work") — 5-step numbered list, verbatim including the working-hours line, fully static. */
import { Page, Text, View } from '@react-pdf/renderer';
import { NumberBadge, SlideBody, SlideTitle } from '../components.js';
import { HOW_WE_WORK } from '../../staticContent.js';
import { COLORS, FONT_BODY, PAGE_HEIGHT, PAGE_WIDTH, SPACING } from '../theme.js';

export function HowWeWorkSlide() {
  return (
    <Page size={[PAGE_WIDTH, PAGE_HEIGHT]}>
      <SlideBody>
        <SlideTitle parts={[{ text: 'How We Work', color: COLORS.teal }]} />
        <View style={{ flexDirection: 'column', gap: SPACING.md }}>
          {HOW_WE_WORK.map((point, i) => (
            <View
              key={point}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACING.md,
                paddingBottom: SPACING.md,
                borderBottomWidth: i < HOW_WE_WORK.length - 1 ? 1 : 0,
                borderBottomColor: COLORS.tealPale,
              }}
            >
              <NumberBadge number={i + 1} color={COLORS.orange} size={40} />
              <Text
                style={{
                  flex: 1,
                  fontFamily: FONT_BODY,
                  fontWeight: 700,
                  fontSize: 15,
                  color: COLORS.teal,
                }}
              >
                {point}
              </Text>
            </View>
          ))}
        </View>
      </SlideBody>
    </Page>
  );
}
