import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text } from 'react-native';
import { points } from '../format';
import { font, useStyles } from '../styles';

const TIE = 0.005;

interface Props {
  irr: number | null;
  benchmarkIrr: number | null;
  name: string;
  onPress: () => void;
}

export function BenchmarkPill({ irr, benchmarkIrr, name, onPress }: Props) {
  const { theme, styles } = useStyles();
  if (irr === null || benchmarkIrr === null) return null;

  const diff = irr - benchmarkIrr;
  const tie = Math.abs(diff) < TIE;
  const text = tie ? `Gleichauf mit ${name}` : `${points(diff)} ${diff > 0 ? 'vor' : 'hinter'} ${name}`;
  const icon = tie ? 'remove' : diff > 0 ? 'trending-up' : 'trending-down';
  const color = tie ? theme.text : diff > 0 ? theme.positive : theme.negative;

  // Zeile am Fuß der Chart-Karte, nicht mehr als eigene schwebende Pille
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, styles.divider, { gap: 6, paddingTop: 10, opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={icon} size={16} color={color} />
      <Text style={{ flex: 1, fontSize: font.chip, fontWeight: '600', color }}>{text}</Text>
      <Ionicons name="chevron-forward" size={14} color={theme.muted} />
    </Pressable>
  );
}
