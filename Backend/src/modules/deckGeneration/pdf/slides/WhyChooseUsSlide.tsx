/** Reference deck page 11 ("Why Choose Us?") — 5-row, 2-column (BeBeyond vs Typical Competitors) comparison table, verbatim copy. */
import { Page, Text, View } from '@react-pdf/renderer';
import { SlideBody, SlideTitle } from '../components.js';
import { WHY_CHOOSE_US } from '../../staticContent.js';
import { COLORS, FONT_BODY, FONT_HEADING, PAGE_HEIGHT, PAGE_WIDTH } from '../theme.js';

const LABEL_WIDTH = 220;

export function WhyChooseUsSlide() {
  return (
    <Page size={[PAGE_WIDTH, PAGE_HEIGHT]}>
      <SlideBody>
        <SlideTitle parts={[{ text: 'Why Choose Us?', color: COLORS.teal }]} />

        <View style={{ flexDirection: 'row' }}>
          <View style={{ width: LABEL_WIDTH }} />
          <View style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: COLORS.orange, borderTopLeftRadius: 8, borderTopRightRadius: 8 }}>
            <Text style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 12, color: COLORS.white }}>
              BeBeyond
            </Text>
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: COLORS.navy, borderTopLeftRadius: 8, borderTopRightRadius: 8 }}>
            <Text style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 12, color: COLORS.white }}>
              Typical Competitors
            </Text>
          </View>
        </View>

        {WHY_CHOOSE_US.map((row, i) => {
          const bg = i % 2 === 0 ? COLORS.tealPale : COLORS.white;
          return (
            <View key={row.label} style={{ flexDirection: 'row', minHeight: 56 }}>
              <View style={{ width: LABEL_WIDTH, justifyContent: 'center', paddingRight: 10 }}>
                <Text style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 11.5, color: COLORS.teal }}>
                  {row.label}
                </Text>
              </View>
              <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 14, backgroundColor: bg }}>
                <Text style={{ fontFamily: FONT_BODY, fontWeight: 400, fontSize: 10.5, lineHeight: 1.3, color: COLORS.textDark }}>
                  {row.bebeyond}
                </Text>
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 14, backgroundColor: bg }}>
                <Text style={{ fontFamily: FONT_BODY, fontWeight: 400, fontSize: 10.5, lineHeight: 1.3, color: COLORS.textMuted }}>
                  {row.competitors}
                </Text>
              </View>
            </View>
          );
        })}
      </SlideBody>
    </Page>
  );
}
