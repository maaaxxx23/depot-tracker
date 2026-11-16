import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { LayoutAnimation, Pressable, Text, View } from 'react-native';
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

/** Weiche Höhen-Änderung beim Ein-/Ausklappen und beim Wechsel zur Nachfrage. */
const animate = () => LayoutAnimation.configureNext(LayoutAnimation.create(250, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));

/**
 * Kleine Karte zu Monatsbeginn: was im Vormonat passiert ist – eigene Ein- und
 * Auszahlungen getrennt von dem, was die Kurse gemacht haben. Das ✕ fragt direkt in
 * der Karte, ob sie nur eingeklappt oder bis zum nächsten Monat ausgeblendet werden soll.
 */
export function MonthReviewCard({ review, collapsed, onCollapse, onExpand, onDismiss }: Props) {
  const { theme, styles } = useStyles();
  const [asking, setAsking] = useState(false);
  // Neuer Monat oder von außen zurückgeholt: Nachfrage schließen
  useEffect(() => setAsking(false), [review.month, collapsed]);

  const hasFlows = Math.abs(review.invested) >= 1;
  const row = (label: string, value: string, opts: { color?: string; divider?: boolean } = {}) => (
    <View style={[styles.row, { justifyContent: 'space-between', gap: 12, paddingVertical: 9 }, opts.divider && styles.divider]}>
      <Text style={[styles.text, { color: theme.muted }]}>{label}</Text>
      <PrivateText style={[styles.text, styles.number, { fontWeight: '600', color: opts.color ?? theme.text }]}>{value}</PrivateText>
    </View>
  );

  const expand = () => {
    tapFeedback();
    animate();
    onExpand();
  };
  const toggleAsking = () => {
    tapFeedback();
    animate();
    setAsking((v) => !v);
  };
  const choose = (action: () => void) => () => {
    tapFeedback();
    animate();
    setAsking(false);
    action();
  };

  return (
    <View style={[styles.card, { gap: 0, overflow: 'hidden' }]}>
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
          onPress={collapsed ? expand : toggleAsking}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={collapsed ? 'Rückblick aufklappen' : asking ? 'Abbrechen' : 'Rückblick ausblenden'}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
        >
          <Ionicons name={collapsed ? 'add' : 'close'} size={20} color={theme.muted} />
        </Pressable>
      </Pressable>
      {!collapsed && asking && (
        <View style={{ gap: 8, marginTop: 8 }}>
          <Pressable
            onPress={choose(onDismiss)}
            accessibilityRole="button"
            style={({ pressed }) => ({ backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}
          >
            <Text style={{ color: theme.onAccent, fontSize: 15, fontWeight: '600' }}>Bis zum nächsten Monat ausblenden</Text>
          </Pressable>
          <Pressable
            onPress={choose(onCollapse)}
            accessibilityRole="button"
            style={({ pressed }) => ({ backgroundColor: theme.chip, borderRadius: 12, paddingVertical: 12, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>Nur einklappen</Text>
          </Pressable>
        </View>
      )}
      {!collapsed && !asking && (
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
