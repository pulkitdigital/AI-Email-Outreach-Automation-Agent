/**
 * Reference deck page 5 ("How can we help?") — 8 benefit cards in a 4x2 grid, numbered badges
 * alternating orange/tealShape, each with a simple inline SVG icon. Cards carry a small "01"–"08"
 * numeral in the corner — verified present in the reference deck's own card design (each benefit
 * is numbered there too), not an invented addition.
 *
 * PERSONALIZED: the 2-3 benefits most relevant to the lead's primary category (DB-sourced via
 * ctx.howCanWeHelpByCategory — category_content, see pdf/generateDeckPdf.ts's
 * loadDeckContentFromDb; the legacy staticContent.ts HOW_CAN_WE_HELP_BY_CATEGORY it replaces stays
 * in place unused, pending a later cleanup pass) are moved to the front via orderBenefitsForLead()
 * and given a lighter "FOR YOU" highlight treatment — mirroring the Our Services slide's
 * "Recommended For You" personalization, scoped down to fit an 8-card grid instead of a 4-item
 * list (a badge above every highlighted card here would be too busy). HOW_CAN_WE_HELP itself (the
 * flat, category-independent list of all 8 possible labels) stays imported from staticContent.ts
 * — it isn't per-category data, so it has no row in category_content to migrate to.
 */
import { Page, Text, View } from '@react-pdf/renderer';
import { IconBadge, SlideBody, SlideTitle } from '../components.js';
import {
  CoinsIcon,
  GearIcon,
  HandshakeIcon,
  MedalIcon,
  RocketIcon,
  ShieldCheckIcon,
  TrendUpIcon,
  TrophyIcon,
} from '../icons.js';
import { HOW_CAN_WE_HELP, orderBenefitsForLead } from '../../staticContent.js';
import type { DeckContext } from '../../types.js';
import { CARD_GAP, COLORS, FONT_HEADING, PAGE_HEIGHT, PAGE_MARGIN, PAGE_WIDTH, SPACING } from '../theme.js';

/** Icon per benefit, keyed by label rather than array position — position no longer identifies a
 * benefit once orderBenefitsForLead() can move any of the 8 to the front. */
const ICONS: Record<string, typeof TrendUpIcon> = {
  'Increased Visibility': TrendUpIcon,
  'Streamlined Processes': GearIcon,
  'Optimized Marketing Spend': CoinsIcon,
  'Confidence and Trust': HandshakeIcon,
  'Sense of Achievement': MedalIcon,
  'Peace of Mind': ShieldCheckIcon,
  'Excitement for Growth': RocketIcon,
  'Competitive Advantage': TrophyIcon,
};

const COLUMNS = 4;

export function HowCanWeHelpSlide({ ctx }: { ctx: DeckContext }) {
  const cardWidth = (PAGE_WIDTH - 2 * PAGE_MARGIN - (COLUMNS - 1) * CARD_GAP.md) / COLUMNS;
  const ordered = orderBenefitsForLead(HOW_CAN_WE_HELP, ctx.primaryCategorySlug, ctx.howCanWeHelpByCategory);

  const relevant = ctx.primaryCategorySlug ? (ctx.howCanWeHelpByCategory[ctx.primaryCategorySlug] ?? []) : [];
  const highlightedLabels = new Set(relevant.filter((label) => HOW_CAN_WE_HELP.includes(label)));

  return (
    <Page size={[PAGE_WIDTH, PAGE_HEIGHT]}>
      <SlideBody>
        <SlideTitle
          parts={[
            { text: 'How can ', color: COLORS.teal },
            { text: 'we help?', color: COLORS.orange },
          ]}
        />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP.md }}>
            {ordered.map((label, i) => {
              const accent = i % 2 === 0 ? COLORS.orange : COLORS.tealShape;
              const Icon = ICONS[label] ?? TrendUpIcon;
              const highlighted = highlightedLabels.has(label);
              return (
                <View
                  key={label}
                  style={{
                    width: cardWidth,
                    minHeight: 208,
                    paddingVertical: SPACING.xl,
                    paddingHorizontal: SPACING.sm,
                    borderRadius: 16,
                    borderWidth: highlighted ? 2.5 : 1.25,
                    borderColor: accent,
                    backgroundColor: highlighted ? COLORS.cream : COLORS.white,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {highlighted ? (
                    <Text
                      style={{
                        position: 'absolute',
                        top: 12,
                        left: 14,
                        fontFamily: FONT_HEADING,
                        fontWeight: 700,
                        fontSize: 8,
                        color: COLORS.white,
                        backgroundColor: accent,
                        paddingVertical: 3,
                        paddingHorizontal: 6,
                        borderRadius: 999,
                      }}
                    >
                      FOR YOU
                    </Text>
                  ) : null}
                  <Text
                    style={{
                      position: 'absolute',
                      top: 12,
                      right: 16,
                      fontFamily: FONT_HEADING,
                      fontWeight: 700,
                      fontSize: 14,
                      color: accent,
                      opacity: 0.45,
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </Text>
                  <IconBadge color={accent} size={56}>
                    <Icon size={30} color={COLORS.white} />
                  </IconBadge>
                  <View style={{ marginTop: SPACING.md, width: 32, height: 2, backgroundColor: accent, borderRadius: 1 }} />
                  <Text
                    style={{
                      marginTop: SPACING.md,
                      fontFamily: FONT_HEADING,
                      fontWeight: 700,
                      fontSize: 13,
                      textAlign: 'center',
                      color: accent,
                    }}
                  >
                    {label}
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
