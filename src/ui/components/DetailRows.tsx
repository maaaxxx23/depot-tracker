import { Text, View } from 'react-native';
import { PrivateText, usePrivacy } from '../privacy';
import { useStyles } from '../styles';

export interface DetailRow {
  label: string;
  /** Kleine zweite Zeile unter der Bezeichnung */
  hint?: string;
  value: string;
  color?: string;
  /** Farbe der Bezeichnung, z. B. die Positionsfarbe des Wertpapiers */
  labelColor?: string;
  /** Wert kräftiger als üblich, z. B. für Summen */
  bold?: boolean;
  /** Wert im Privatsphäre-Modus weichzeichnen */
  private?: boolean;
  /** Spielerei: Der Wert läuft Zeichen für Zeichen durch diese Farben (nicht im Privatsphäre-Modus) */
  valueColors?: string[];
}

/** Wert, dessen Zeichen gleichmäßig über die mitgegebenen Farben verlaufen. */
function RainbowValue({ value, colors, style }: { value: string; colors: string[]; style: object }) {
  const chars = [...value];
  const colorAt = (k: number) => colors[Math.min(colors.length - 1, Math.floor((k * colors.length) / Math.max(1, chars.length)))];
  return (
    <Text style={style}>
      {chars.map((ch, k) => (
        <Text key={k} style={{ color: colorAt(k) }}>
          {ch}
        </Text>
      ))}
    </Text>
  );
}

/** Karte mit Zeilen „Bezeichnung … Wert“. Lange Bezeichnungen brechen um, der Wert bleibt rechts. */
export function DetailRows({ rows }: { rows: DetailRow[] }) {
  const { theme, styles } = useStyles();
  const { hidden } = usePrivacy();
  return (
    <View style={[styles.card, { gap: 0, paddingVertical: 4 }]}>
      {rows.map((r, i) => {
        const valueStyle = [styles.text, styles.number, { fontWeight: (r.bold ? '700' : '600') as '600' | '700', color: r.color ?? theme.text }];
        return (
          <View key={r.label} style={[styles.row, { justifyContent: 'space-between', paddingVertical: 12, gap: 12 }, i > 0 && styles.divider]}>
            <View style={{ flex: 1, flexShrink: 1, gap: 2 }}>
              <Text style={[styles.text, { color: r.labelColor ?? theme.muted }, r.labelColor ? { fontWeight: '600' } : null]}>{r.label}</Text>
              {r.hint ? <Text style={styles.small}>{r.hint}</Text> : null}
            </View>
            <View style={{ flexShrink: 0, alignItems: 'flex-end' }}>
              {r.valueColors && r.valueColors.length > 0 && !hidden ? (
                <RainbowValue value={r.value} colors={r.valueColors} style={valueStyle} />
              ) : r.private ? (
                <PrivateText containerStyle={{ alignSelf: 'auto' }} style={valueStyle}>
                  {r.value}
                </PrivateText>
              ) : (
                <Text style={valueStyle}>{r.value}</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
