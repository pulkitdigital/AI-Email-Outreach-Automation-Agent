/** Reference deck page 1. Personalized: company name (+ industry, when known) rendered below the tagline. */
import { Page, Text, View } from '@react-pdf/renderer';
import type { DeckContext } from '../../types.js';
import { COLORS, CONTACT, FONT_BODY, FONT_HEADING, PAGE_HEIGHT, PAGE_WIDTH } from '../theme.js';

export function CoverSlide({ ctx }: { ctx: DeckContext }) {
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
        <Text style={{ fontFamily: FONT_HEADING, fontWeight: 800, fontSize: 72 }}>
          <Text style={{ color: COLORS.orange }}>Be</Text>
          <Text style={{ color: COLORS.teal }}>Beyond</Text>
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: FONT_HEADING,
            fontWeight: 600,
            fontSize: 28,
            color: COLORS.orange,
          }}
        >
          Digital Solutions
        </Text>
        <Text
          style={{
            marginTop: 24,
            fontFamily: FONT_HEADING,
            fontWeight: 700,
            fontSize: 22,
            color: COLORS.orange,
            textAlign: 'center',
          }}
        >
          {CONTACT.tagline}
        </Text>

        <Text
          style={{
            marginTop: 40,
            fontFamily: FONT_HEADING,
            fontWeight: 600,
            fontSize: 18,
            color: COLORS.teal,
            textAlign: 'center',
          }}
        >
          Prepared for {ctx.companyName}
        </Text>
        {ctx.industry ? (
          <Text
            style={{
              marginTop: 6,
              fontFamily: FONT_BODY,
              fontWeight: 400,
              fontSize: 14,
              color: COLORS.textMuted,
              textAlign: 'center',
            }}
          >
            Built for the {ctx.industry} industry
          </Text>
        ) : null}
      </View>
    </Page>
  );
}
