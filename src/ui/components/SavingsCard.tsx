import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { GoalProjection, Savings } from '../../finance/savings';
import { eur, percent } from '../format';
import { PrivateText } from '../privacy';
import { useStyles } from '../styles';

interface Props {
  savings: Savings;
  /** Wunschbetrag; null = noch keiner festgelegt */
  goal: number | null;
  projection: GoalProjection | null;
  onOpen: () => void;
}

/** Halbe Karte: Sparrate und Zielfortschritt in Kurzform. Antippen öffnet „Sparen & Ziel“. */
export function SavingsCard({ savings, goal, projection, onOpen }: Props) {
  const { theme, styles } = useStyles();
  const hasRate = savings.monthlyRate > 0;

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel="Sparrate und Ziel öffnen"
      style={({ pressed }) => [styles.card, { flex: 1, gap: 4, opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text style={styles.label}>Sparen & Ziel</Text>
        <Ionicons name="chevron-forward" size={14} color={theme.muted} />
      </View>
      {hasRate ? (
        <PrivateText containerStyle={{ alignSelf: 'flex-start' }} style={[styles.number, { fontSize: 22, fontWeight: '700', color: theme.text }]}>
          {eur(savings.monthlyRate)}
        </PrivateText>
      ) : (
        <Text style={{ fontSize: 22, fontWeight: '700', color: theme.muted }}>–</Text>
      )}
      <Text style={styles.small}>{hasRate ? 'Sparrate im Monat' : 'keine Sparrate erkannt'}</Text>
      {goal && projection ? (
        <View style={{ gap: 4, marginTop: 4 }}>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.chip, overflow: 'hidden' }}>
            <View style={{ width: `${projection.progress * 100}%`, height: 6, borderRadius: 3, backgroundColor: projection.remaining <= 0 ? theme.positive : theme.accent }} />
          </View>
          <Text style={styles.small}>{percent(projection.progress)} des Ziels</Text>
        </View>
      ) : (
        <Text style={[styles.small, { color: theme.accent, marginTop: 4 }]}>Ziel festlegen</Text>
      )}
    </Pressable>
  );
}
