/**
 * Small shared layout primitives reused across slide components — the react-pdf equivalent of
 * the old pptxgenjs pipeline's slides/cardHelpers.ts (addSlideTitle / drawIconCard), rebuilt for
 * View/Text/Svg instead of pptxgenjs's addShape/addText calls.
 */
import type { ReactNode } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { COLORS, FONT_BODY, FONT_HEADING, PAGE_MARGIN, SPACING } from './theme.js';

/** Standard title treatment used across every content slide: two-tone heading + underline rule (the reference deck's "tealShape" underline bar beneath section headings). */
export function SlideTitle({
  parts,
  subtitle,
}: {
  parts: Array<{ text: string; color: string }>;
  subtitle?: string;
}) {
  return (
    <View style={{ marginBottom: SPACING.lg }}>
      <Text style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 34 }}>
        {parts.map((part, i) => (
          <Text key={i} style={{ color: part.color }}>
            {part.text}
          </Text>
        ))}
      </Text>
      <View
        style={{
          marginTop: SPACING.sm,
          width: 120,
          height: 4,
          borderRadius: 2,
          backgroundColor: COLORS.tealShape,
        }}
      />
      {subtitle ? (
        <Text
          style={{
            marginTop: SPACING.sm,
            fontFamily: FONT_BODY,
            fontWeight: 400,
            fontSize: 13,
            color: COLORS.textMuted,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/** Every slide's outer content wrapper: consistent page padding, white background. */
export function SlideBody({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'column',
        flexGrow: 1,
        backgroundColor: COLORS.white,
        padding: PAGE_MARGIN,
      }}
    >
      {children}
    </View>
  );
}

/** A numbered circular badge, alternating brand accent colors — used for lists/steps/cards. */
export function NumberBadge({
  number,
  color,
  size = 34,
}: {
  number: number;
  color: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: COLORS.white, fontFamily: FONT_HEADING, fontWeight: 700, fontSize: size * 0.42 }}>
        {number}
      </Text>
    </View>
  );
}

/** A round icon badge (colored disc + centered SVG icon) — the react-pdf equivalent of drawIconCard's emoji circle. */
export function IconBadge({
  color,
  size = 48,
  children,
}: {
  color: string;
  size?: number;
  children: ReactNode;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </View>
  );
}
