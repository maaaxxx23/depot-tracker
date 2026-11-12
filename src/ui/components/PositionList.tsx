import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import type { AllocationRow } from '../../finance/allocation';
import { PositionResult } from '../../finance/performance';
import { eur, pct, percent, shortPercent } from '../format';
import { PrivateText } from '../privacy';
import { signColor, useStyles } from '../styles';
import { Theme } from '../theme';

export const positionColor = (theme: Theme, index: number) => theme.palette[Math.min(index, theme.palette.length - 1)];

interface Props {
  positions: PositionResult[];
  onSelect: (position: PositionResult) => void;
  /** Abweichung vom Wunschanteil je ISIN; leer ohne Zielaufteilung */
  allocation: Map<string, AllocationRow>;
  onEditTargets: () => void;
}

export function PositionList({ positions, onSelect, allocation, onEditTargets }: Props) {
  const { theme, styles } = useStyles();

  return (
    <View style={[styles.card, { gap: 0, paddingBottom: 4 }]}>
      <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
        <Text style={styles.cardTitle}>Positionen</Text>
        <Pressable onPress={onEditTargets} hitSlop={10} accessibilityRole="button" style={({ pressed }) => [styles.row, { gap: 2, opacity: pressed ? 0.6 : 1 }]}>
          <Text style={[styles.small, { color: theme.accent }]}>Zielaufteilung</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.accent} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2, marginBottom: 4 }}>
        {positions.map((p, i) => (
          <View key={p.instrument.isin} style={{ flex: p.share, backgroundColor: positionColor(theme, i) }} />
        ))}
      </View>
      {positions.map((p, i) => (
        <Pressable
          key={p.instrument.isin}
          onPress={() => onSelect(p)}
          style={({ pressed }) => [styles.row, { paddingVertical: 12, gap: 10, opacity: pressed ? 0.6 : 1 }, i > 0 && styles.divider]}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: positionColor(theme, i) }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text }}>{p.instrument.shortName}</Text>
            <Text style={styles.small}>
              {p.instrument.kind} · {percent(p.share)}
              {allocation.has(p.instrument.isin) && (
                <Text style={allocation.get(p.instrument.isin)!.off ? { color: theme.warn, fontWeight: '600' } : undefined}> · Ziel {shortPercent(allocation.get(p.instrument.isin)!.target)}</Text>
              )}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <PrivateText containerStyle={{ alignSelf: 'flex-end' }} style={[styles.number, { fontSize: 16, fontWeight: '600', color: theme.text }]}>
              {eur(p.value)}
            </PrivateText>
            <Text style={[styles.small, styles.number, { color: signColor(theme, p.irr) }]}>{pct(p.irr)} p.a.</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.muted} />
        </Pressable>
      ))}
    </View>
  );
}
