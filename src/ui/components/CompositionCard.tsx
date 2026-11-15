import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import type { CompositionResult, Slice } from '../../finance/composition';
import type { OverlapResult } from '../../finance/overlap';
import type { PositionResult } from '../../finance/performance';
import { percent } from '../format';
import { useStyles } from '../styles';
import { positionColor } from './PositionList';

interface Props {
  result: CompositionResult;
  overlap: OverlapResult;
  /** Positionen in der Reihenfolge der Startseite, für die ETF-Farben */
  positions: PositionResult[];
  onOpen: () => void;
}

const top = (slices: Slice[]) =>
  slices
    .slice(0, 3)
    .map((s) => `${s.label} ${Math.round(s.weight * 100)} %`)
    .join(' · ');

/** Kurzfassung: die drei größten Länder und Branchen im Depot. Antippen öffnet die Details. */
export function CompositionCard({ result, overlap, positions, onOpen }: Props) {
  const { theme, styles } = useStyles();
  const has = result.covered > 0;
  const strongest = overlap.pairs[0]?.level === 'high' ? overlap.pairs[0] : null;
  // Dieselbe Farbe wie in der Positionen-Karte
  const colorFor = (isin: string) => {
    const index = positions.findIndex((p) => p.instrument.isin === isin);
    return index >= 0 ? positionColor(theme, index) : theme.warn;
  };

  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel="Zusammensetzung des Depots öffnen" style={({ pressed }) => [styles.card, { gap: 8, opacity: pressed ? 0.6 : 1 }]}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text style={styles.cardTitle}>Was steckt drin</Text>
        <View style={[styles.row, { gap: 2 }]}>
          <Text style={[styles.small, !has && { color: theme.accent }]}>{has ? 'Details' : 'Einrichten'}</Text>
          <Ionicons name="chevron-forward" size={16} color={has ? theme.muted : theme.accent} />
        </View>
      </View>
      {has ? (
        <>
          <View style={{ gap: 2 }}>
            <Text style={styles.small}>Länder</Text>
            <Text style={styles.text}>{top(result.countries)}</Text>
          </View>
          <View style={{ gap: 2 }}>
            <Text style={styles.small}>Branchen</Text>
            <Text style={styles.text}>{top(result.sectors)}</Text>
          </View>
          {strongest && (
            <Text style={[styles.small, { color: theme.warn }]}>
              Überschneidung: <Text style={{ color: colorFor(strongest.a.instrument.isin), fontWeight: '600' }}>{strongest.a.instrument.shortName}</Text> und{' '}
              <Text style={{ color: colorFor(strongest.b.instrument.isin), fontWeight: '600' }}>{strongest.b.instrument.shortName}</Text> zu {Math.round(strongest.overlap * 100)} %
            </Text>
          )}
          {result.covered < 0.9995 && <Text style={styles.small}>Ausgewertet: {percent(result.covered)} des Depots</Text>}
        </>
      ) : (
        <Text style={[styles.text, { color: theme.muted }]}>Länder, Branchen und größte Firmen über alle deine ETFs. Dafür einmal die Bestandslisten importieren.</Text>
      )}
    </Pressable>
  );
}
