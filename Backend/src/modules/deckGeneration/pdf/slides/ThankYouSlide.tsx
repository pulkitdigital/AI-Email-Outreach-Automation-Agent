/** Reference deck page 14 ("Thank You") — PERSONALIZED closing line addressing the lead's company by name, plus BRAND_CONTACT details. */
import { Link, Page, Text, View } from '@react-pdf/renderer';
import type { DeckContext } from '../../types.js';
import { COLORS, CONTACT, FONT_BODY, FONT_HEADING, PAGE_HEIGHT, PAGE_WIDTH, SPACING } from '../theme.js';

/** Bounded so a long company name wraps/truncates instead of overflowing past the page edge. */
const PERSONALIZED_LINE_WIDTH = 900;

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
            marginTop: 28,
            width: PERSONALIZED_LINE_WIDTH,
            fontFamily: FONT_BODY,
            fontWeight: 400,
            fontStyle: 'italic',
            fontSize: 18,
            color: COLORS.teal,
            textAlign: 'center',
            maxLines: 2,
            textOverflow: 'ellipsis',
          }}
        >
          We look forward to partnering with {ctx.companyName}.
        </Text>

        <Text style={{ marginTop: 48, fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 28 }}>
          <Text style={{ color: COLORS.orange }}>Be</Text>
          <Text style={{ color: COLORS.teal }}>Beyond Digital Solutions</Text>
        </Text>
        <Text
          style={{
            marginTop: 14,
            fontFamily: FONT_HEADING,
            fontWeight: 700,
            fontSize: 19,
            color: COLORS.orange,
            textAlign: 'center',
          }}
        >
          {CONTACT.tagline}
        </Text>

        <View style={{ marginTop: 56, flexDirection: 'row', alignItems: 'center', gap: SPACING.xl }}>
          <Text style={{ fontFamily: FONT_BODY, fontWeight: 700, fontSize: 13, color: COLORS.teal }}>
            {CONTACT.phone}
          </Text>
          <Text style={{ fontFamily: FONT_BODY, fontWeight: 700, fontSize: 13, color: COLORS.teal }}>
            {CONTACT.email}
          </Text>
          <Link
            src={CONTACT.website}
            style={{ fontFamily: FONT_BODY, fontWeight: 700, fontSize: 13, color: COLORS.orange, textDecoration: 'none' }}
          >
            {CONTACT.websiteLabel}
          </Link>
        </View>
        <Text
          style={{
            marginTop: 14,
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
