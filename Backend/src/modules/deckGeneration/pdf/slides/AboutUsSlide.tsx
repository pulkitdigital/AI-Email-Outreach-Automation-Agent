/**
 * Reference deck page 2 — the reference page's own copy is genuinely short (heading + eyebrow +
 * one paragraph — verified against Docs/design-reference/pitch-deck-reference.pdf page 2, nothing
 * else is on that page), so this slide adds real supporting content rather than just enlarging
 * the existing text: a decorative quote mark, a two-column "Our Mission / What We Believe" block
 * (new sentences, but paraphrased strictly from positioning already established elsewhere in this
 * codebase — the "forget the typical agency model" partner framing from ABOUT_US.eyebrow/body and
 * the transparent-pricing/real-results/long-term-support differentiators already written out in
 * staticContent.ts's WHY_CHOOSE_US row bodies and providers/ai/prompts/emailCopy.ts's positioning
 * line — no invented stats), and a highlight strip reusing WHY_CHOOSE_US's five row labels
 * verbatim so About Us and Why Choose Us share some visual connective tissue.
 */
import { Page, Text, View } from '@react-pdf/renderer';
import { ABOUT_US, WHY_CHOOSE_US } from '../../staticContent.js';
import { HandshakeIcon, QuoteIcon } from '../icons.js';
import { CARD_RADIUS, COLORS, CONTACT, FONT_BODY, FONT_HEADING, PAGE_HEIGHT, PAGE_WIDTH, SPACING } from '../theme.js';

const MISSION_COLUMNS = [
  {
    title: 'Our Mission',
    body: "We help ambitious businesses grow online without the usual agency overhead — real strategy, honest execution, and a team that sticks around after launch.",
  },
  {
    title: 'What We Believe',
    body: 'No inflated promises, no hidden fees — just transparent pricing, results we can actually show you, and support that continues long after a project ships.',
  },
];

export function AboutUsSlide() {
  return (
    <Page size={[PAGE_WIDTH, PAGE_HEIGHT]}>
      <View
        style={{
          flexGrow: 1,
          backgroundColor: COLORS.white,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 80,
        }}
      >
        <View
          style={{
            width: '100%',
            minHeight: 560,
            borderWidth: 4,
            borderColor: COLORS.orange,
            borderRadius: CARD_RADIUS,
            backgroundColor: COLORS.cream,
            paddingVertical: 56,
            paddingHorizontal: 80,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ position: 'absolute', top: 24, left: 32, opacity: 0.16 }}>
            <QuoteIcon size={64} color={COLORS.orange} />
          </View>

          <Text style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 34, color: COLORS.teal }}>
            About Us
          </Text>
          <Text
            style={{
              marginTop: SPACING.md,
              fontFamily: FONT_HEADING,
              fontWeight: 700,
              fontSize: 18,
              color: COLORS.orange,
              textAlign: 'center',
            }}
          >
            {ABOUT_US.eyebrow}
          </Text>
          <Text
            style={{
              marginTop: SPACING.sm,
              maxWidth: 760,
              fontFamily: FONT_BODY,
              fontWeight: 400,
              fontSize: 14.5,
              lineHeight: 1.55,
              color: COLORS.orange,
              textAlign: 'center',
            }}
          >
            {ABOUT_US.body}
          </Text>

          <View
            style={{
              marginTop: SPACING.lg,
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACING.sm,
              paddingVertical: SPACING.xs,
              paddingHorizontal: SPACING.lg,
              borderRadius: 999,
              backgroundColor: COLORS.teal,
            }}
          >
            <HandshakeIcon size={18} color={COLORS.white} />
            <Text style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 13, color: COLORS.white }}>
              {CONTACT.tagline}
            </Text>
          </View>

          <View
            style={{
              marginTop: SPACING.lg,
              flexDirection: 'row',
              gap: SPACING.xl,
              width: '100%',
              maxWidth: 820,
            }}
          >
            {MISSION_COLUMNS.map((column) => (
              <View key={column.title} style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 13.5, color: COLORS.teal, textAlign: 'center' }}>
                  {column.title}
                </Text>
                <View style={{ marginTop: 4, marginBottom: SPACING.xs, alignSelf: 'center', width: 28, height: 2, backgroundColor: COLORS.orange, borderRadius: 1 }} />
                <Text
                  style={{
                    fontFamily: FONT_BODY,
                    fontWeight: 400,
                    fontSize: 10.5,
                    lineHeight: 1.45,
                    color: COLORS.textDark,
                    textAlign: 'center',
                  }}
                >
                  {column.body}
                </Text>
              </View>
            ))}
          </View>

          <View style={{ marginTop: SPACING.lg, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: SPACING.xs }}>
            {WHY_CHOOSE_US.map((row) => (
              <View
                key={row.label}
                style={{
                  paddingVertical: SPACING.xxs,
                  paddingHorizontal: SPACING.sm,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: COLORS.orange,
                }}
              >
                <Text style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 9, color: COLORS.orange }}>
                  {row.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </Page>
  );
}
