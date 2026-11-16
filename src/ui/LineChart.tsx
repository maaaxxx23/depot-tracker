import { useState } from 'react';
import { GestureResponderEvent, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { monthYear } from './format';
import { BlurFilter, blurForFont, mask, useSvgId } from './privacy';
import { Theme } from './theme';

export interface ChartSeries {
  values: number[];
  color: string;
  dashed?: boolean;
  /** Eigene Strichstärke, z. B. dünne Vergleichslinien; sonst 1,5 (gestrichelt) bzw. 2,2 */
  width?: number;
}

interface Props {
  dates: string[];
  series: ChartSeries[];
  theme: Theme;
  height?: number;
  /** Ohne Achsen und Raster, z. B. für das Positionsblatt. */
  compact?: boolean;
  formatY?: (n: number) => string;
  /** Meldet den Punkt unter dem Finger (null beim Loslassen); ohne Callback ist der Chart nicht antippbar. */
  onActiveChange?: (index: number | null) => void;
  /** Beträge im Chart (y-Achse, Hoch-/Tiefpunkt) verwischen (Privatsphäre-Modus). */
  blurValues?: boolean;
  /** Hoch- und Tiefpunkt dieser Linie beschriften (Index in `series`). */
  markExtremesOf?: number;
  formatExtreme?: (n: number) => string;
  /** Ereignisse auf einer Linie (Index in `series`): der Abschnitt zum Punkt wird gestrichelt in eigener Farbe gezeichnet */
  events?: { series: number; indices: number[]; color: string };
}

const Y_LABEL_SIZE = 10;
const EXTREME_LABEL_SIZE = 11;
// Mehr Luft ober- und unterhalb der Linien, wenn Hoch-/Tiefpunkt beschriftet werden
const DOMAIN_PAD = 0.05;
const DOMAIN_PAD_WITH_LABELS = 0.14;

export function LineChart({
  dates,
  series,
  theme,
  height = 220,
  compact = false,
  formatY = String,
  onActiveChange,
  blurValues = false,
  markExtremesOf,
  formatExtreme = formatY,
  events,
}: Props) {
  const [width, setWidth] = useState(0);
  const filterId = useSvgId('values');
  const [active, setActiveState] = useState<number | null>(null);
  const setActive = (index: number | null) => {
    if (index === active) return;
    setActiveState(index);
    onActiveChange?.(index);
  };
  const pad = compact ? { top: 4, right: 4, bottom: 4, left: 4 } : { top: 8, right: 8, bottom: 22, left: 52 };

  const all = series.flatMap((s) => s.values);
  const rawMin = Math.min(...all);
  const rawMax = Math.max(...all);
  const span = rawMax - rawMin || 1;
  const domainPad = markExtremesOf !== undefined ? DOMAIN_PAD_WITH_LABELS : DOMAIN_PAD;
  // Beträge nicht unter 0 strecken; Renditen dürfen negativ sein
  const min = rawMin >= 0 ? Math.max(0, rawMin - span * domainPad) : rawMin - span * domainPad;
  const max = rawMax + span * domainPad;

  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (dates.length > 1 ? (i / (dates.length - 1)) * plotW : 0);
  const y = (v: number) => pad.top + plotH - ((v - min) / (max - min)) * plotH;

  const ticks = [0, 1, 2, 3].map((k) => min + ((max - min) * k) / 3);
  const xLabels = [0, Math.floor((dates.length - 1) / 2), dates.length - 1];

  const scrub = (e: GestureResponderEvent) => {
    if (plotW <= 0 || dates.length < 2) return;
    const ratio = (e.nativeEvent.locationX - pad.left) / plotW;
    setActive(Math.round(Math.min(1, Math.max(0, ratio)) * (dates.length - 1)));
  };
  const scrubbable = !!onActiveChange;

  const marked = markExtremesOf !== undefined ? series[markExtremesOf]?.values : undefined;
  const extremes = marked?.length
    ? [
        { index: marked.indexOf(Math.max(...marked)), above: true },
        { index: marked.indexOf(Math.min(...marked)), above: false },
      ]
    : [];
  /**
   * Position der Beschriftung von Hoch- bzw. Tiefpunkt. Reihenfolge der Versuche:
   * 1. mittig über dem Hoch- bzw. unter dem Tiefpunkt, dann auf der anderen Seite,
   * 2. direkt neben dem Punkt auf gleicher Höhe (rechts, dann links), etwa am Rand des Charts,
   * 3. seitlich versetzt und etwas weiter weg.
   * Genommen wird die erste Stelle, an der weder eine Linie noch der Rand den Text stört.
   */
  type Anchor = 'start' | 'middle' | 'end';
  const labelWidth = (text: string) => text.length * EXTREME_LABEL_SIZE * 0.6 + 6;
  const labelPos = (index: number, text: string, preferAbove: boolean): { x: number; base: number; anchor: Anchor } => {
    const v = marked![index];
    const px = x(index);
    const textWidth = labelWidth(text);
    const step = dates.length > 1 ? plotW / (dates.length - 1) : plotW || 1;
    const box = (c: { x: number; anchor: Anchor }) => {
      const left = c.anchor === 'middle' ? c.x - textWidth / 2 : c.anchor === 'start' ? c.x : c.x - textWidth;
      return { left, right: left + textWidth };
    };
    const fits = (c: { x: number; base: number; anchor: Anchor }) => {
      const { left, right } = box(c);
      return left >= pad.left - 2 && right <= width - pad.right + 2 && c.base - EXTREME_LABEL_SIZE >= pad.top - 2 && c.base <= pad.top + plotH;
    };
    // Abstand zwischen Textkasten und der nächsten Linie (0 = Linie läuft durch den Text)
    const clearance = (c: { x: number; base: number; anchor: Anchor }) => {
      const { left, right } = box(c);
      const top = c.base - EXTREME_LABEL_SIZE;
      const bottom = c.base + 3;
      const from = Math.max(0, Math.floor((left - pad.left) / step));
      const to = Math.min(dates.length - 1, Math.ceil((right - pad.left) / step));
      let gap = Infinity;
      for (const s of series) {
        for (let j = from; j <= to; j++) {
          // Linie zwischen zwei Punkten: beide Enden und die Mitte prüfen
          for (const ly of [y(s.values[j]), j < to ? (y(s.values[j]) + y(s.values[j + 1])) / 2 : y(s.values[j])]) {
            gap = Math.min(gap, ly < top ? top - ly : ly > bottom ? ly - bottom : 0);
          }
        }
      }
      return gap;
    };
    const above = (lift: number) => y(v) - 8 - lift;
    const below = (lift: number) => y(v) + EXTREME_LABEL_SIZE + 6 + lift;
    const sides = preferAbove ? [above, below] : [below, above];
    // Neben dem Punkt: Text etwas weg von der Richtung, in die die Linie weiterläuft
    const besideBase = preferAbove ? y(v) - 1 : y(v) + EXTREME_LABEL_SIZE * 0.7;
    const candidates: { x: number; base: number; anchor: Anchor }[] = [
      ...sides.map((side) => ({ x: px, base: side(0), anchor: 'middle' as const })),
      { x: px + 8, base: besideBase, anchor: 'start' },
      { x: px - 8, base: besideBase, anchor: 'end' },
    ];
    for (const lift of [0, 10, 22]) {
      for (const shift of [-1, 1]) for (const side of sides) candidates.push({ x: px + shift * (textWidth / 2 + 6), base: side(lift), anchor: 'middle' });
      if (lift > 0) for (const side of sides) candidates.push({ x: px, base: side(lift), anchor: 'middle' });
    }
    const inside = candidates.filter(fits);
    if (!inside.length) return { x: Math.min(Math.max(px, pad.left + textWidth / 2), width - pad.right - textWidth / 2), base: y(v) - 8, anchor: 'middle' };
    return inside.find((c) => clearance(c) >= 3) ?? inside.reduce((best, c) => (clearance(c) > clearance(best) ? c : best));
  };
  const valueText = (text: string) => (blurValues ? mask(text) : text);
  const valueFilter = blurValues ? `url(#${filterId})` : undefined;

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height }}
      onStartShouldSetResponder={() => scrubbable}
      onMoveShouldSetResponder={() => scrubbable}
      onResponderTerminationRequest={() => false}
      onResponderGrant={scrub}
      onResponderMove={scrub}
      onResponderRelease={() => setActive(null)}
      onResponderTerminate={() => setActive(null)}
    >
      {width > 0 && (
        <Svg width={width} height={height} pointerEvents="none">
          {blurValues && <BlurFilter id={filterId} stdDeviation={blurForFont(Y_LABEL_SIZE)} />}
          {!compact &&
            ticks.map((t) => (
              <Line key={`g${t}`} x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={theme.border} strokeWidth={1} />
            ))}
          {!compact &&
            ticks.map((t) => (
              <SvgText
                key={`l${t}`}
                x={pad.left - 6}
                y={y(t) + 4}
                fontSize={Y_LABEL_SIZE}
                fill={theme.muted}
                textAnchor="end"
                filter={valueFilter}
              >
                {valueText(formatY(t))}
              </SvgText>
            ))}
          {!compact &&
            xLabels.map((i, k) => (
              <SvgText
                key={`x${k}`}
                x={x(i)}
                y={height - 6}
                fontSize={10}
                fill={theme.muted}
                textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}
              >
                {monthYear(dates[i])}
              </SvgText>
            ))}
          {series.map((s, k) => (
            <Path
              key={k}
              d={s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
              stroke={s.color}
              strokeWidth={s.width ?? (s.dashed ? 1.5 : 2.2)}
              strokeDasharray={s.dashed ? '4 4' : undefined}
              strokeLinejoin="round"
              fill="none"
            />
          ))}
          {/* Ereignisse (z. B. Verkäufe): der Sprung soll nicht wie ein Kurseinbruch aussehen */}
          {events &&
            series[events.series] &&
            events.indices.map((i) => {
              const v = series[events.series].values;
              const from = Math.max(0, i - 1);
              const d = `M${x(from).toFixed(1)},${y(v[from]).toFixed(1)} L${x(i).toFixed(1)},${y(v[i]).toFixed(1)}`;
              return (
                <G key={`e${i}`}>
                  <Path d={d} stroke={theme.card} strokeWidth={4} fill="none" />
                  <Path d={d} stroke={events.color} strokeWidth={2.2} strokeDasharray="3 3" fill="none" />
                  <Circle cx={x(i)} cy={y(v[i])} r={3.5} fill={events.color} stroke={theme.card} strokeWidth={1.5} />
                </G>
              );
            })}
          {/* Hoch- und Tiefpunkt; beim Ziehen ausgeblendet, damit nur die Werte unter dem Finger zählen */}
          {active === null &&
            marked &&
            extremes.map(({ index, above }) => {
              const text = valueText(formatExtreme(marked[index]));
              const pos = labelPos(index, text, above);
              // In der Farbe der Linie, damit klar ist, zu welcher Linie die Zahl gehört
              const color = series[markExtremesOf!].color;
              // Steht die Zahl weiter weg, verbindet eine feine gepunktete Linie sie mit ihrem Punkt
              const w = labelWidth(text);
              const left = pos.anchor === 'middle' ? pos.x - w / 2 : pos.anchor === 'start' ? pos.x : pos.x - w;
              const px = x(index);
              const py = y(marked[index]);
              const nx = Math.min(Math.max(px, left + 3), left + w - 3);
              const ny = Math.min(Math.max(py, pos.base - EXTREME_LABEL_SIZE + 1), pos.base + 2);
              const dist = Math.hypot(nx - px, ny - py);
              const leader =
                dist > 12 ? (
                  <Line
                    key={`${above ? 'max' : 'min'}-leader`}
                    x1={px + ((nx - px) / dist) * 4}
                    y1={py + ((ny - py) / dist) * 4}
                    x2={nx - ((nx - px) / dist) * 3}
                    y2={ny - ((ny - py) / dist) * 3}
                    stroke={color}
                    strokeWidth={1}
                    strokeDasharray="1.5 2.5"
                    strokeLinecap="round"
                  />
                ) : null;
              // Erst ein Rand in Kartenfarbe, dann der Text: bleibt lesbar, auch wenn eine Linie nah vorbeiläuft
              return [leader, ...[theme.card, color].map((fill, layer) => (
                <SvgText
                  key={`${above ? 'max' : 'min'}${layer}`}
                  x={pos.x}
                  y={pos.base}
                  fontSize={EXTREME_LABEL_SIZE}
                  fontWeight="600"
                  fill={fill}
                  stroke={layer === 0 ? theme.card : undefined}
                  strokeWidth={layer === 0 ? 4 : undefined}
                  strokeLinejoin="round"
                  textAnchor={pos.anchor}
                  filter={valueFilter}
                >
                  {text}
                </SvgText>
              ))];
            })}
          {active !== null && (
            <>
              <Line x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + plotH} stroke={theme.muted} strokeWidth={1} />
              {series
                .filter((s) => !s.dashed)
                .map((s, k) => (
                  <Circle key={k} cx={x(active)} cy={y(s.values[active])} r={4} fill={s.color} stroke={theme.card} strokeWidth={2} />
                ))}
            </>
          )}
        </Svg>
      )}
    </View>
  );
}
