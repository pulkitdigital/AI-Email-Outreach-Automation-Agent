/** Reference deck page 5 ("How can we help?") — 8 benefit cards in a 4x2 grid, numbered badges alternating orange/tealShape, each with a simple inline SVG icon. */
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
import { HOW_CAN_WE_HELP } from '../../staticContent.js';
import { COLORS, FONT_HEADING, PAGE_HEIGHT, PAGE_WIDTH, SPACING } from '../theme.js';

/** Icon per benefit, matched by its position in HOW_CAN_WE_HELP (staticContent.ts) — see the slide-by-slide build spec for the reasoning behind each pairing. */
const ICONS = [TrendUpIcon, GearIcon, CoinsIcon, HandshakeIcon, MedalIcon, ShieldCheckIcon, RocketIcon, TrophyIcon];

const COLUMNS = 4;
const GAP = 16;

export function HowCanWeHelpSlide() {
  const cardWidth = (PAGE_WIDTH - 2 * 64 - (COLUMNS - 1) * GAP) / COLUMNS;

  return (
    <Page size={[PAGE_WIDTH, PAGE_HEIGHT]}>
      <SlideBody>
        <SlideTitle
          parts={[
            { text: 'How can ', color: COLORS.teal },
            { text: 'we help?', color: COLORS.orange },
          ]}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
          {HOW_CAN_WE_HELP.map((label, i) => {
            const accent = i % 2 === 0 ? COLORS.orange : COLORS.tealShape;
            const Icon = ICONS[i] ?? TrendUpIcon;
            return (
              <View
                key={label}
                style={{
                  width: cardWidth,
                  paddingVertical: 20,
                  paddingHorizontal: 12,
                  borderRadius: 14,
                  borderWidth: 1.25,
                  borderColor: accent,
                  backgroundColor: COLORS.white,
                  alignItems: 'center',
                }}
              >
                <IconBadge color={accent} size={44}>
                  <Icon size={24} color={COLORS.white} />
                </IconBadge>
                <Text
                  style={{
                    marginTop: SPACING.sm,
                    fontFamily: FONT_HEADING,
                    fontWeight: 700,
                    fontSize: 11.5,
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
      </SlideBody>
    </Page>
  );
}
