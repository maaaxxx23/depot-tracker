import { Text, View } from 'react-native';
import { PrivateText } from '../privacy';
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
}

/** Karte mit Zeilen „Bezeichnung … Wert“. Lange Bezeichnungen brechen um, der Wert bleibt rechts. */
export function DetailRows({ rows }: { rows: DetailRow[] }) {
  const { theme, styles } = useStyles();
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
              {r.private ? (
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
