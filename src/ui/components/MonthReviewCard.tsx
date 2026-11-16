import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import type { MonthReview } from '../../finance/monthReview';
import { eur, monthWord, signedEur } from '../format';
import { tapFeedback } from '../haptics';
import { PrivateText } from '../privacy';
import { useStyles } from '../styles';

/**
 * Kleine Karte zu Monatsbeginn: was im Vormonat passiert ist – eigene Ein- und
 * Auszahlungen getrennt von dem, was die Kurse gemacht haben.
 */
export function MonthReviewCard({ review, onDismiss }: { review: MonthReview; onDismiss: () => void }) {
  const { theme, styles } = useStyles();
  const hasFlows = Math.abs(review.invested) >= 1;
  const row = (label: string, value: string, opts: { color?: string; divider?: boolean } = {}) => (
    <View style={[styles.row, { justifyContent: 'space-between', gap: 12, paddingVertical: 9 }, opts.divider && styles.divider]}>
      <Text style={[styles.text, { color: theme.muted }]}>{label}</Text>
      <PrivateText style={[styles.text, styles.number, { fontWeight: '600', color: opts.color ?? theme.text }]}>{value}</PrivateText>
    </View>
  );
  return (
    <View style={[styles.card, { gap: 0 }]}>
      <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 2 }]}>
        <Text style={styles.cardTitle}>Rückblick {monthWord(review.month)}</Text>
        <Pressable
          onPress={() => {
            tapFeedback();
            onDismiss();
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Rückblick ausblenden"
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
        >
          <Ionicons name="close" size={20} color={theme.muted} />
        </Pressable>
      </View>
      {hasFlows && row(review.invested >= 0 ? 'Eingezahlt' : 'Entnommen', eur(Math.abs(review.invested)))}
      {row('Wertentwicklung', signedEur(review.gain), { color: review.gain >= 0 ? theme.positive : theme.negative })}
      {/* Ohne Ein- und Auszahlungen wäre die Summe dieselbe Zahl noch einmal */}
      {hasFlows && row('Depot insgesamt', signedEur(review.change), { divider: true })}
    </View>
  );
}
