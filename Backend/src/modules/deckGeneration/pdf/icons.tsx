/**
 * Simple inline SVG icons built from react-pdf's basic shape primitives (<Svg>/<Path>/<Circle>/
 * <Rect>/<Line>/<Polygon>) — deliberately geometric constructions, not a recreation of any
 * specific icon font's glyphs. This is a direct requirement from the "not a pixel-perfect
 * recreation" brief: the reference deck's actual icon artwork isn't available as an image asset
 * we can legally/practically re-embed, so every icon here is redrawn from scratch as basic shapes
 * that read clearly at deck scale (roughly 28-40pt) without needing an external icon library or
 * font glyphs (which would reintroduce the exact font-substitution risk this migration exists to
 * remove).
 *
 * Every icon takes the same {size, color} props and a 0-24 viewBox so they drop into any card
 * layout interchangeably.
 */
import { Circle, Line, Path, Polygon, Rect, Svg } from '@react-pdf/renderer';

export interface IconProps {
  size?: number;
  color?: string;
}

const DEFAULT_SIZE = 28;
const STROKE = 1.8;

function strokeProps(color: string) {
  return {
    stroke: color,
    strokeWidth: STROKE,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
}

/** Increased Visibility — upward trend line with an arrowhead. */
export function TrendUpIcon({ size = DEFAULT_SIZE, color = '#000000' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path d="M3 17 L9.5 10.5 L13.5 14.5 L21 6" {...strokeProps(color)} />
      <Path d="M15 6 L21 6 L21 12" {...strokeProps(color)} />
    </Svg>
  );
}

/** Streamlined Processes — a gear rendered as a ring with radiating ticks. */
export function GearIcon({ size = DEFAULT_SIZE, color = '#000000' }: IconProps) {
  const ticks = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Circle cx={12} cy={12} r={4.5} {...strokeProps(color)} />
      {ticks.map((angle, i) => {
        const x1 = 12 + Math.cos(angle) * 7;
        const y1 = 12 + Math.sin(angle) * 7;
        const x2 = 12 + Math.cos(angle) * 10;
        const y2 = 12 + Math.sin(angle) * 10;
        return <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} {...strokeProps(color)} />;
      })}
    </Svg>
  );
}

/** Optimized Marketing Spend — two stacked coins. */
export function CoinsIcon({ size = DEFAULT_SIZE, color = '#000000' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Circle cx={9} cy={9} r={6} {...strokeProps(color)} />
      <Path d="M6.5 9 L11.5 9 M9 6.5 L9 11.5" {...strokeProps(color)} />
      <Circle cx={15} cy={16} r={5} {...strokeProps(color)} />
      <Path d="M12.8 16 L17.2 16" {...strokeProps(color)} />
    </Svg>
  );
}

/** Confidence and Trust — two hands (triangular forms) meeting at the center. */
export function HandshakeIcon({ size = DEFAULT_SIZE, color = '#000000' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Polygon points="2,13 10,9 12,11 10,15" {...strokeProps(color)} />
      <Polygon points="22,13 14,9 12,11 14,15" {...strokeProps(color)} />
      <Circle cx={12} cy={11} r={1.4} fill={color} />
    </Svg>
  );
}

/** Sense of Achievement — a medal: ringed disc with a two-tail ribbon. */
export function MedalIcon({ size = DEFAULT_SIZE, color = '#000000' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path d="M9 3 L6 9 M15 3 L18 9" {...strokeProps(color)} />
      <Circle cx={12} cy={14} r={6} {...strokeProps(color)} />
      <Circle cx={12} cy={14} r={2.6} {...strokeProps(color)} />
    </Svg>
  );
}

/** Peace of Mind — a shield with a checkmark. */
export function ShieldCheckIcon({ size = DEFAULT_SIZE, color = '#000000' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path d="M12 3 L20 6 L20 12 C20 17 16.5 20 12 21 C7.5 20 4 17 4 12 L4 6 Z" {...strokeProps(color)} />
      <Path d="M8.5 12 L11 14.5 L16 9" {...strokeProps(color)} />
    </Svg>
  );
}

/** Excitement for Growth — a rocket. */
export function RocketIcon({ size = DEFAULT_SIZE, color = '#000000' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path
        d="M12 2 C15.5 5 16.5 9.5 15.5 14.5 L8.5 14.5 C7.5 9.5 8.5 5 12 2 Z"
        {...strokeProps(color)}
      />
      <Circle cx={12} cy={8.5} r={1.6} {...strokeProps(color)} />
      <Path d="M8.5 13 L5.5 17 L8.5 16.2 Z" {...strokeProps(color)} />
      <Path d="M15.5 13 L18.5 17 L15.5 16.2 Z" {...strokeProps(color)} />
      <Path d="M10.3 14.5 L9.5 20 L12 18.3 L14.5 20 L13.7 14.5" {...strokeProps(color)} />
    </Svg>
  );
}

/** Competitive Advantage — a trophy. */
export function TrophyIcon({ size = DEFAULT_SIZE, color = '#000000' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path d="M7 4 L17 4 L17 10 C17 13 14.8 15 12 15 C9.2 15 7 13 7 10 Z" {...strokeProps(color)} />
      <Path d="M7 5.5 C4.5 5.5 3.5 8.5 5.5 10.2 C6.2 10.8 7 11 7 11" {...strokeProps(color)} />
      <Path d="M17 5.5 C19.5 5.5 20.5 8.5 18.5 10.2 C17.8 10.8 17 11 17 11" {...strokeProps(color)} />
      <Line x1={12} y1={15} x2={12} y2={18} {...strokeProps(color)} />
      <Path d="M8.5 21 L15.5 21 L14.5 18 L9.5 18 Z" {...strokeProps(color)} />
    </Svg>
  );
}

/** Web Development — a monitor. */
export function MonitorIcon({ size = DEFAULT_SIZE, color = '#000000' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Rect x={3} y={4} width={18} height={12} rx={1.5} {...strokeProps(color)} />
      <Line x1={9} y1={20} x2={15} y2={20} {...strokeProps(color)} />
      <Line x1={12} y1={16} x2={12} y2={20} {...strokeProps(color)} />
    </Svg>
  );
}

/** App Development — a mobile phone. */
export function PhoneIcon({ size = DEFAULT_SIZE, color = '#000000' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Rect x={7} y={2.5} width={10} height={19} rx={1.8} {...strokeProps(color)} />
      <Line x1={10.5} y1={18.3} x2={13.5} y2={18.3} {...strokeProps(color)} />
    </Svg>
  );
}

/** AI Bot — a chat bubble with a small robot face. */
export function RobotChatIcon({ size = DEFAULT_SIZE, color = '#000000' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path
        d="M4 5 L20 5 C21.1 5 22 5.9 22 7 L22 14 C22 15.1 21.1 16 20 16 L9 16 L5 20 L5 16 L4 16 C2.9 16 2 15.1 2 14 L2 7 C2 5.9 2.9 5 4 5 Z"
        {...strokeProps(color)}
      />
      <Circle cx={9} cy={10.5} r={1.1} fill={color} />
      <Circle cx={15} cy={10.5} r={1.1} fill={color} />
      <Path d="M9 13 L15 13" {...strokeProps(color)} />
    </Svg>
  );
}

/** SEO — a magnifying glass. */
export function MagnifierIcon({ size = DEFAULT_SIZE, color = '#000000' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Circle cx={10.5} cy={10.5} r={6.5} {...strokeProps(color)} />
      <Line x1={15.2} y1={15.2} x2={21} y2={21} {...strokeProps(color)} />
    </Svg>
  );
}

/** PPC — a cursor click pointer with click marks. */
export function CursorClickIcon({ size = DEFAULT_SIZE, color = '#000000' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Polygon points="5,3 5,17 9,13.5 11.5,19 14,17.8 11.5,12.5 16,12.5" {...strokeProps(color)} />
      <Line x1={19} y1={3} x2={19} y2={6} {...strokeProps(color)} />
      <Line x1={22} y1={7} x2={19.5} y2={8} {...strokeProps(color)} />
    </Svg>
  );
}

/** Social Media Marketing — two overlapping chat bubbles. */
export function ChatBubblesIcon({ size = DEFAULT_SIZE, color = '#000000' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path d="M2 5 L14 5 L14 12 L6 12 L3 15 L3 12 L2 12 Z" {...strokeProps(color)} />
      <Path d="M9 9 L21 9 L21 16 L19 16 L19 19 L15 16 L9 16 Z" {...strokeProps(color)} />
    </Svg>
  );
}

/** Email Marketing — an envelope. */
export function EnvelopeIcon({ size = DEFAULT_SIZE, color = '#000000' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Rect x={2.5} y={5} width={19} height={14} rx={1.5} {...strokeProps(color)} />
      <Path d="M3 6 L12 13 L21 6" {...strokeProps(color)} />
    </Svg>
  );
}

/** WhatsApp Marketing — a phone handset inside a chat bubble. */
export function WhatsAppIcon({ size = DEFAULT_SIZE, color = '#000000' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Circle cx={12} cy={11} r={9} {...strokeProps(color)} />
      <Path
        d="M8 8.3 C7.7 9.7 8.6 11.6 9.8 12.9 C11.1 14.2 13 15.1 14.4 14.7 C14.9 14.6 15.4 14.1 15.5 13.6 C15.6 13.3 15.5 13 15.3 12.8 L13.9 11.9 C13.6 11.7 13.3 11.7 13.1 11.9 L12.6 12.4 C11.8 11.9 11 11.1 10.6 10.3 L11.1 9.8 C11.3 9.6 11.3 9.3 11.1 9 L10.2 7.6 C10 7.4 9.7 7.3 9.4 7.4 C8.9 7.5 8.1 7.9 8 8.3 Z"
        fill={color}
        stroke="none"
      />
      <Path d="M4.5 19 L5.5 15.7" {...strokeProps(color)} />
    </Svg>
  );
}

/** A single 5-point star, used for testimonial ratings. */
export function StarIcon({ size = 16, color = '#FB8500' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Polygon
        points="12,2 14.7,9 22,9.3 16.2,14 18.2,21 12,17 5.8,21 7.8,14 2,9.3 9.3,9"
        fill={color}
        stroke="none"
      />
    </Svg>
  );
}

/** Row of five star icons, used on the Major Wins testimonial cards. */
export function StarRow({ size = 14, color = '#FB8500' }: IconProps) {
  return (
    <Svg viewBox="0 0 130 24" width={size * 5.2} height={size}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Polygon
          key={i}
          transform={`translate(${i * 26}, 0)`}
          points="12,2 14.7,9 22,9.3 16.2,14 18.2,21 12,17 5.8,21 7.8,14 2,9.3 9.3,9"
          fill={color}
          stroke="none"
        />
      ))}
    </Svg>
  );
}
