/** Reference deck page 14 ("Thank You") — PERSONALIZED closing line addressing the lead's company by name, plus BRAND_CONTACT details. */
import { Page, Text, View } from '@react-pdf/renderer';
import type { DeckContext } from '../../types.js';
import { COLORS, CONTACT, FONT_BODY, FONT_HEADING, PAGE_HEIGHT, PAGE_WIDTH } from '../theme.js';

export function ThankYouSlide({ ctx }: { ctx: DeckContext }) {
  return (
    <Page size={[PAGE_WIDTH, PAGE_HEIGHT]}>
      <View
        style={{
          flexGrow: 1,
          backgroundColor: COLORS.white,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 100,
        }}
      >
        <Text style={{ fontFamily: FONT_HEADING, fontWeight: 800, fontSize: 60 }}>
          <Text style={{ color: COLORS.teal }}>Thank </Text>
          <Text style={{ color: COLORS.orange }}>You</Text>
        </Text>
        <Text
          style={{
            marginTop: 20,
            fontFamily: FONT_BODY,
            fontWeight: 400,
            fontStyle: 'italic',
            fontSize: 18,
            color: COLORS.teal,
            textAlign: 'center',
          }}
        >
          We look forward to partnering with {ctx.companyName}.
        </Text>

        <Text style={{ marginTop: 36, fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 26 }}>
          <Text style={{ color: COLORS.orange }}>Be</Text>
          <Text style={{ color: COLORS.teal }}>Beyond Digital Solutions</Text>
        </Text>
        <Text
          style={{
            marginTop: 12,
            fontFamily: FONT_HEADING,
            fontWeight: 700,
            fontSize: 18,
            color: COLORS.orange,
            textAlign: 'center',
          }}
        >
          {CONTACT.tagline}
        </Text>

        <View style={{ marginTop: 40, flexDirection: 'row', gap: 48 }}>
          <Text style={{ fontFamily: FONT_BODY, fontWeight: 700, fontSize: 13, color: COLORS.teal }}>
            {CONTACT.phone}
          </Text>
          <Text style={{ fontFamily: FONT_BODY, fontWeight: 700, fontSize: 13, color: COLORS.teal }}>
            {CONTACT.email}
          </Text>
        </View>
        <Text
          style={{
            marginTop: 10,
            fontFamily: FONT_BODY,
            fontWeight: 700,
            fontSize: 13,
            color: COLORS.orange,
            textAlign: 'center',
          }}
        >
          {CONTACT.address}
        </Text>
      </View>
    </Page>
  );
}
