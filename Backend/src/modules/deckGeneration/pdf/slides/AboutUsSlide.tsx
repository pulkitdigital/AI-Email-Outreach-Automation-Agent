/** Reference deck page 2 — fully static. Rounded cream card with an orange border, matching the verified reference styling (~4pt border, ~24pt corner radius). */
import { Page, Text, View } from '@react-pdf/renderer';
import { ABOUT_US } from '../../staticContent.js';
import { CARD_RADIUS, COLORS, FONT_BODY, FONT_HEADING, PAGE_HEIGHT, PAGE_WIDTH, SPACING } from '../theme.js';

export function AboutUsSlide() {
  return (
    <Page size={[PAGE_WIDTH, PAGE_HEIGHT]}>
      <View
        style={{
          flexGrow: 1,
          backgroundColor: COLORS.white,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 90,
        }}
      >
        <View
          style={{
            width: '100%',
            borderWidth: 4,
            borderColor: COLORS.orange,
            borderRadius: CARD_RADIUS,
            backgroundColor: COLORS.cream,
            paddingVertical: 56,
            paddingHorizontal: 72,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 36, color: COLORS.teal }}>
            About Us
          </Text>
          <Text
            style={{
              marginTop: SPACING.lg,
              fontFamily: FONT_HEADING,
              fontWeight: 700,
              fontSize: 19,
              color: COLORS.orange,
              textAlign: 'center',
            }}
          >
            {ABOUT_US.eyebrow}
          </Text>
          <Text
            style={{
              marginTop: SPACING.md,
              fontFamily: FONT_BODY,
              fontWeight: 400,
              fontSize: 15,
              lineHeight: 1.5,
              color: COLORS.orange,
              textAlign: 'center',
            }}
          >
            {ABOUT_US.body}
          </Text>
        </View>
      </View>
    </Page>
  );
}
