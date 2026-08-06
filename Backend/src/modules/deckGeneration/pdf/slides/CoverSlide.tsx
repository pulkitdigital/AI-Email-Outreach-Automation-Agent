/**
 * Reference deck page 1. Personalized: company name (+ industry, when known) rendered below the
 * tagline. The reference cover (Docs/design-reference/pitch-deck-reference.pdf page 1) is just
 * the wordmark + tagline — nothing else to reuse from there — so the badge row below is
 * genuinely new supporting content, kept strictly to already-established facts (founding year
 * and service-pillar count from serviceCatalog.ts/staticContent.ts, address from brand.ts, and
 * the lead's own industry field) rather than invented stats.
 */
import { Link, Page, Text, View } from '@react-pdf/renderer';
import type { DeckContext } from '../../types.js';
import { SERVICE_CATEGORIES } from '../../serviceCatalog.js';
import { COLORS, CONTACT, FONT_BODY, FONT_HEADING, PAGE_HEIGHT, PAGE_WIDTH, SPACING } from '../theme.js';

/** Bounded so a long company name/industry wraps (up to a couple of lines) and truncates with an
 * ellipsis past that, rather than overflowing past the page edge — see the "long company names"
 * layout-audit requirement. */
const PERSONALIZED_LINE_WIDTH = 900;

function Badge({ label }: { label: string }) {
  return (
    <View
      style={{
        paddingVertical: SPACING.xs,
        paddingHorizontal: SPACING.md,
        borderRadius: 999,
        borderWidth: 1.25,
        borderColor: COLORS.teal,
      }}
    >
      <Text style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 11, color: COLORS.teal }}>{label}</Text>
    </View>
  );
}

export function CoverSlide({ ctx }: { ctx: DeckContext }) {
  const badges = [
    'Est. 2024',
    `${SERVICE_CATEGORIES.length} Service Pillars`,
    'Prayagraj, India',
    ...(ctx.industry ? [`${ctx.industry} Specialist`] : []),
  ];

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
            marginTop: 32,
            fontFamily: FONT_HEADING,
            fontWeight: 700,
            fontSize: 24,
            color: COLORS.orange,
            textAlign: 'center',
          }}
        >
          {CONTACT.tagline}
        </Text>

        <Text
          style={{
            marginTop: 56,
            width: PERSONALIZED_LINE_WIDTH,
            fontFamily: FONT_HEADING,
            fontWeight: 600,
            fontSize: 18,
            color: COLORS.teal,
            textAlign: 'center',
            maxLines: 2,
            textOverflow: 'ellipsis',
          }}
        >
          Prepared for {ctx.companyName}
        </Text>
        {ctx.industry ? (
          <Text
            style={{
              marginTop: 6,
              width: PERSONALIZED_LINE_WIDTH,
              fontFamily: FONT_BODY,
              fontWeight: 400,
              fontSize: 14,
              color: COLORS.textMuted,
              textAlign: 'center',
              maxLines: 1,
              textOverflow: 'ellipsis',
            }}
          >
            Built for the {ctx.industry} industry
          </Text>
        ) : null}

        <View
          style={{
            marginTop: SPACING.xl,
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: SPACING.sm,
            maxWidth: PERSONALIZED_LINE_WIDTH,
          }}
        >
          {badges.map((label) => (
            <Badge key={label} label={label} />
          ))}
        </View>

        <Link
          src={CONTACT.website}
          style={{
            marginTop: SPACING.xxl,
            fontFamily: FONT_BODY,
            fontWeight: 700,
            fontSize: 13,
            color: COLORS.orange,
            textDecoration: 'none',
          }}
        >
          {CONTACT.websiteLabel}
        </Link>
      </View>
    </Page>
  );
}
