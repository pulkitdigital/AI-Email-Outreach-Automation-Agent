/**
 * Reference deck page 7 ("Our Services") — PERSONALIZED: the lead's primary category (from
 * categorization) is moved to the front and visually emphasized (border/background + a
 * "Recommended For You" badge), reusing the same orderCategoriesForLead() mapping the old
 * pptxgenjs slide (slides/ourServicesSlide.ts) already relied on — not reinvented here.
 *
 * Card content (displayName/services/accentColor) is DB-sourced (ctx.ourServicesCategories,
 * fetched from category_content — see pdf/generateDeckPdf.ts's loadDeckContentFromDb) rather than
 * the legacy hardcoded serviceCatalog.ts SERVICE_CATEGORIES array, which stays in place unused
 * (dead code, pending a later cleanup pass) but is no longer read here.
 */
import { Page, Text, View } from '@react-pdf/renderer';
import { SlideBody, SlideTitle } from '../components.js';
import { OUR_SERVICES_SUBTITLE } from '../../staticContent.js';
import { orderCategoriesForLead } from '../../serviceCatalog.js';
import type { DeckContext } from '../../types.js';
import { CARD_GAP, CARD_RADIUS, COLORS, FONT_BODY, FONT_HEADING, PAGE_HEIGHT, PAGE_MARGIN, PAGE_WIDTH, SPACING } from '../theme.js';

export function OurServicesSlide({ ctx }: { ctx: DeckContext }) {
  const ordered = orderCategoriesForLead(ctx.ourServicesCategories, ctx.primaryCategorySlug);
  const cardWidth = (PAGE_WIDTH - 2 * PAGE_MARGIN - (ordered.length - 1) * CARD_GAP.md) / ordered.length;

  return (
    <Page size={[PAGE_WIDTH, PAGE_HEIGHT]}>
      <SlideBody>
        <SlideTitle
          parts={[
            { text: 'Our ', color: COLORS.teal },
            { text: 'Services', color: COLORS.orange },
          ]}
          subtitle={OUR_SERVICES_SUBTITLE}
        />
        <View style={{ flex: 1, justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', gap: CARD_GAP.md, alignItems: 'flex-start' }}>
          {ordered.map((category, i) => {
            const highlighted = category.slug === ctx.primaryCategorySlug;
            const accent = `#${category.accentColor}`;
            return (
              <View key={category.slug} style={{ width: cardWidth }}>
                {highlighted ? (
                  <Text
                    style={{
                      marginBottom: 6,
                      fontFamily: FONT_HEADING,
                      fontWeight: 700,
                      fontSize: 9,
                      color: COLORS.white,
                      backgroundColor: accent,
                      textAlign: 'center',
                      paddingVertical: SPACING.xxs,
                      borderRadius: 4,
                    }}
                  >
                    RECOMMENDED FOR YOU
                  </Text>
                ) : (
                  <View style={{ height: 21 }} />
                )}
                <View
                  style={{
                    padding: SPACING.lg,
                    minHeight: 340,
                    justifyContent: 'center',
                    borderRadius: CARD_RADIUS * 0.6,
                    borderWidth: highlighted ? 2.5 : 1.25,
                    borderColor: accent,
                    backgroundColor: highlighted ? COLORS.cream : COLORS.tealPale,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FONT_HEADING,
                      fontWeight: 700,
                      fontSize: 14,
                      color: accent,
                      textAlign: 'center',
                    }}
                  >
                    {i + 1}. {category.displayName}
                  </Text>
                  <View
                    style={{
                      marginTop: SPACING.xs,
                      marginBottom: SPACING.sm,
                      height: 1.5,
                      backgroundColor: accent,
                      opacity: 0.35,
                    }}
                  />
                  <View>
                    {category.services.map((service) => (
                      <View
                        key={service}
                        style={{ flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm, gap: 8 }}
                      >
                        {/* A small colored dot bullet rather than a "✓" text glyph — Public
                            Sans's registered Latin subset (fonts.ts) doesn't include dingbat
                            glyphs like U+2713, which silently renders as nothing rather than an
                            error, so a plain shape sidesteps that font-coverage gap entirely. */}
                        <View
                          style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: accent, flexShrink: 0 }}
                        />
                        <Text
                          style={{
                            flex: 1,
                            fontFamily: FONT_BODY,
                            fontWeight: 400,
                            fontSize: 12.5,
                            color: COLORS.textDark,
                          }}
                        >
                          {service}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
        </View>
      </SlideBody>
    </Page>
  );
}
