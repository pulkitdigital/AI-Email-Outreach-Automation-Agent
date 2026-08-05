/**
 * Reference deck page 4 ("Success Stories") — the reference shows a 27-logo grid; rendered here
 * as a clean typographic name grid instead (no logo image assets — see SUCCESS_STORY_CLIENTS's
 * own comment in staticContent.ts for the verified, corrected client list).
 */
import { Page, Text, View } from '@react-pdf/renderer';
import { SlideBody, SlideTitle } from '../components.js';
import { SUCCESS_STORY_CLIENTS } from '../../staticContent.js';
import { COLORS, FONT_BODY, PAGE_HEIGHT, PAGE_WIDTH } from '../theme.js';

const COLUMNS = 4;

export function SuccessStoriesSlide() {
  return (
    <Page size={[PAGE_WIDTH, PAGE_HEIGHT]}>
      <SlideBody>
        <SlideTitle parts={[{ text: 'Success Stories', color: COLORS.teal }]} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {SUCCESS_STORY_CLIENTS.map((name, i) => {
            const accent = i % 2 === 0 ? COLORS.teal : COLORS.orange;
            const cardWidth = (PAGE_WIDTH - 2 * 64 - 3 * 12) / COLUMNS;
            return (
              <View
                key={name}
                style={{
                  width: cardWidth,
                  paddingVertical: 14,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor: COLORS.tealPale,
                  borderLeftWidth: 3,
                  borderLeftColor: accent,
                }}
              >
                <Text
                  style={{
                    fontFamily: FONT_BODY,
                    fontWeight: 500,
                    fontSize: 11,
                    color: COLORS.textDark,
                  }}
                >
                  {name}
                </Text>
              </View>
            );
          })}
        </View>
      </SlideBody>
    </Page>
  );
}
