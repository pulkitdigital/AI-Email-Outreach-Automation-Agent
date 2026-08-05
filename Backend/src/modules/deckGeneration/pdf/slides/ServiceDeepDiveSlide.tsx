/**
 * Reference deck pages 8+9 ("Creative Services") — the reference actually has two near-duplicate
 * pages; per the merge instruction, this slide uses page 9's content (SERVICE_DEEP_DIVE: 5 cards
 * with one-line descriptions) plus its subtitle. Page 8's more granular 3-column breakdown is
 * superseded by the merge and intentionally not reproduced (see SERVICE_DEEP_DIVE's own comment
 * in staticContent.ts).
 */
import { Page, Text, View } from '@react-pdf/renderer';
import { IconBadge, SlideBody, SlideTitle } from '../components.js';
import { ChatBubblesIcon, CursorClickIcon, EnvelopeIcon, MagnifierIcon, WhatsAppIcon } from '../icons.js';
import { SERVICE_DEEP_DIVE, SERVICE_DEEP_DIVE_SUBTITLE } from '../../staticContent.js';
import { COLORS, FONT_BODY, FONT_HEADING, PAGE_HEIGHT, PAGE_WIDTH, SPACING } from '../theme.js';

const ICONS = [MagnifierIcon, CursorClickIcon, ChatBubblesIcon, EnvelopeIcon, WhatsAppIcon];
const GAP = 16;

export function ServiceDeepDiveSlide() {
  const cardWidth = (PAGE_WIDTH - 2 * 64 - (SERVICE_DEEP_DIVE.length - 1) * GAP) / SERVICE_DEEP_DIVE.length;

  return (
    <Page size={[PAGE_WIDTH, PAGE_HEIGHT]}>
      <SlideBody>
        <SlideTitle
          parts={[{ text: 'Creative Services', color: COLORS.teal }]}
          subtitle={SERVICE_DEEP_DIVE_SUBTITLE}
        />
        <View style={{ flexDirection: 'row', gap: GAP }}>
          {SERVICE_DEEP_DIVE.map((item, i) => {
            const Icon = ICONS[i] ?? MagnifierIcon;
            return (
              <View
                key={item.title}
                style={{
                  width: cardWidth,
                  padding: 18,
                  borderRadius: 14,
                  borderWidth: 1.25,
                  borderColor: COLORS.teal,
                  backgroundColor: COLORS.white,
                  alignItems: 'center',
                }}
              >
                <IconBadge color={COLORS.teal} size={44}>
                  <Icon size={24} color={COLORS.white} />
                </IconBadge>
                <Text
                  style={{
                    marginTop: SPACING.sm,
                    fontFamily: FONT_HEADING,
                    fontWeight: 700,
                    fontSize: 12,
                    color: COLORS.teal,
                    textAlign: 'center',
                  }}
                >
                  {item.title}
                </Text>
                <Text
                  style={{
                    marginTop: 6,
                    fontFamily: FONT_BODY,
                    fontWeight: 400,
                    fontSize: 10.5,
                    color: COLORS.textDark,
                    textAlign: 'center',
                  }}
                >
                  {item.body}
                </Text>
              </View>
            );
          })}
        </View>
      </SlideBody>
    </Page>
  );
}
