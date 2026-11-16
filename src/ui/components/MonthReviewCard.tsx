import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, Text, View } from 'react-native';
import type { MonthReview } from '../../finance/monthReview';
import { eur, monthWord, signedEur } from '../format';
import { tapFeedback } from '../haptics';
import { PrivateText } from '../privacy';
import { useStyles } from '../styles';

interface Props {
  review: MonthReview;
  /** Nur die Titelzeile zeigen; das ✕ wird zum + */
  collapsed: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  /** Bis zum nächsten Monat ganz ausblenden */
  onDismiss: () => void;
}

/**
 * Kleine Karte zu Monatsbeginn: was im Vormonat passiert ist – eigene Ein- und
 * Auszahlungen getrennt von dem, was die Kurse gemacht haben. Das ✕ fragt, ob die
 * Karte nur eingeklappt oder bis zum nächsten Monat ausgeblendet werden soll.
 */
export function MonthReviewCard({ review, collapsed, onCollapse, onExpand, onDismiss }: Props) {
  const { theme, styles } = useStyles();
  const hasFlows = Math.abs(review.invested) >= 1;
  const row = (label: string, value: string, opts: { color?: string; divider?: boolean } = {}) => (
    <View style={[styles.row, { justifyContent: 'space-between', gap: 12, paddingVertical: 9 }, opts.divider && styles.divider]}>
      <Text style={[styles.text, { color: theme.muted }]}>{label}</Text>
      <PrivateText style={[styles.text, styles.number, { fontWeight: '600', color: opts.color ?? theme.text }]}>{value}</PrivateText>
    </View>
  );
  const expand = () => {
    tapFeedback();
    onExpand();
  };
  const ask = () => {
    tapFeedback();
    Alert.alert('Rückblick ausblenden', undefined, [
      { text: 'Bis zum nächsten Monat ausblenden', onPress: onDismiss },
      { text: 'Nur einklappen', onPress: onCollapse },
      { text: 'Abbrechen', style: 'cancel' },
    ]);
  };
  return (
    <View style={[styles.card, { gap: 0 }]}>
      {/* Eingeklappt öffnet auch ein Tipp auf die Zeile selbst */}
      <Pressable
        disabled={!collapsed}
        onPress={expand}
        accessibilityRole={collapsed ? 'button' : undefined}
        accessibilityLabel={collapsed ? 'Rückblick aufklappen' : undefined}
        style={[styles.row, { justifyContent: 'space-between' }, !collapsed && { marginBottom: 2 }]}
      >
        <Text style={styles.cardTitle}>Rückblick {monthWord(review.month)}</Text>
        <Pressable
          onPress={collapsed ? expand : ask}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={collapsed ? 'Rückblick aufklappen' : 'Rückblick ausblenden'}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
        >
          <Ionicons name={collapsed ? 'add' : 'close'} size={20} color={theme.muted} />
        </Pressable>
      </Pressable>
      {!collapsed && (
        <>
          {hasFlows && row(review.invested >= 0 ? 'Eingezahlt' : 'Entnommen', eur(Math.abs(review.invested)))}
          {row('Wertentwicklung', signedEur(review.gain), { color: review.gain >= 0 ? theme.positive : theme.negative })}
          {/* Ohne Ein- und Auszahlungen wäre die Summe dieselbe Zahl noch einmal */}
          {hasFlows && row('Depot insgesamt', signedEur(review.change), { divider: true })}
        </>
      )}
    </View>
  );
}
