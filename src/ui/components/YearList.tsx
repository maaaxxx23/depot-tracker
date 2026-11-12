import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import type { YearResult } from '../../finance/years';
import { pct, signedEur } from '../format';
import { PrivateText } from '../privacy';
import { signColor, useStyles } from '../styles';

interface Props {
  /** Neuestes Jahr zuerst */
  years: YearResult[];
  onOpen: () => void;
}

/** Halbe Karte: das laufende Jahr in Kurzform, darunter die Vorjahre. Antippen öffnet die Jahresübersicht. */
export function YearList({ years, onOpen }: Props) {
  const { theme, styles } = useStyles();
  if (!years.length) return null;
  const current = years[0];
  const previous = years.slice(1, 3);

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel="Jahresübersicht öffnen"
      style={({ pressed }) => [styles.card, { flex: 1, gap: 4, opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text style={styles.label}>Jahre</Text>
        <Ionicons name="chevron-forward" size={14} color={theme.muted} />
      </View>
      <PrivateText containerStyle={{ alignSelf: 'flex-start' }} style={[styles.number, { fontSize: 22, fontWeight: '700', color: signColor(theme, current.gain) }]}>
        {signedEur(current.gain)}
      </PrivateText>
      <Text style={styles.small}>
        {current.year}
        {current.running ? ' bisher' : ''} · {pct(current.twr)}
      </Text>
      {previous.length > 0 && (
        <Text style={[styles.small, styles.number, { marginTop: 4 }]}>{previous.map((y) => `${y.year} ${pct(y.twr)}`).join(' · ')}</Text>
      )}
    </Pressable>
  );
}
