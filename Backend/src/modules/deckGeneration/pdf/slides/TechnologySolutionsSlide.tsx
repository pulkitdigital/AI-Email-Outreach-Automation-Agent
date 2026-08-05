/** Reference deck page 6 ("Technology Solutions") — 3 columns as cards with a monitor / phone / robot-chat icon respectively. */
import { Page, Text, View } from '@react-pdf/renderer';
import { IconBadge, SlideBody, SlideTitle } from '../components.js';
import { MonitorIcon, PhoneIcon, RobotChatIcon } from '../icons.js';
import { TECHNOLOGY_SOLUTIONS } from '../../staticContent.js';
import { COLORS, FONT_BODY, FONT_HEADING, PAGE_HEIGHT, PAGE_WIDTH, SPACING } from '../theme.js';

const ICONS = [MonitorIcon, PhoneIcon, RobotChatIcon];
const ACCENTS = [COLORS.teal, COLORS.orange, COLORS.tealShape];
const GAP = 24;

export function TechnologySolutionsSlide() {
  const cardWidth = (PAGE_WIDTH - 2 * 64 - 2 * GAP) / 3;

  return (
    <Page size={[PAGE_WIDTH, PAGE_HEIGHT]}>
      <SlideBody>
        <SlideTitle
          parts={[
            { text: 'Technology ', color: COLORS.teal },
            { text: 'Solutions', color: COLORS.orange },
          ]}
        />
        <View style={{ flexDirection: 'row', gap: GAP }}>
          {TECHNOLOGY_SOLUTIONS.map((column, i) => {
            const accent = ACCENTS[i] ?? COLORS.teal;
            const Icon = ICONS[i] ?? MonitorIcon;
            return (
              <View
                key={column.title}
                style={{
                  width: cardWidth,
                  padding: 24,
                  borderRadius: 16,
                  borderWidth: 1.5,
                  borderColor: accent,
                  backgroundColor: COLORS.white,
                  alignItems: 'center',
                }}
              >
                <IconBadge color={accent} size={56}>
                  <Icon size={30} color={COLORS.white} />
                </IconBadge>
                <Text
                  style={{
                    marginTop: SPACING.md,
                    fontFamily: FONT_HEADING,
                    fontWeight: 700,
                    fontSize: 16,
                    color: accent,
                  }}
                >
                  {column.title}
                </Text>
                <View style={{ marginTop: SPACING.sm, alignItems: 'center' }}>
                  {column.items.map((item) => (
                    <Text
                      key={item}
                      style={{
                        marginTop: 4,
                        fontFamily: FONT_BODY,
                        fontWeight: 400,
                        fontSize: 12,
                        color: COLORS.textDark,
                      }}
                    >
                      {item}
                    </Text>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      </SlideBody>
    </Page>
  );
}
