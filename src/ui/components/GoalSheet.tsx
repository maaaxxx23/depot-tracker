import { useEffect, useState } from 'react';
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GoalProjection, MAX_RETURN, RETURN_STEP, Savings } from '../../finance/savings';
import type { Instrument } from '../../types';
import { dayMonth, eur, monthName, monthYear, pct, percent, shortPercent } from '../format';
import { usePrivacy } from '../privacy';
import { Sheet } from '../Sheet';
import { useStyles } from '../styles';
import { DetailRow, DetailRows } from './DetailRows';

interface Props {
  visible: boolean;
  onClose: () => void;
  savings: Savings;
  instruments: Instrument[];
  goal: number | null;
  projection: GoalProjection | null;
  /** null entfernt das Ziel */
  onChangeGoal: (goal: number | null) => void;
  /** Angenommene Rendite pro Jahr für die Hochrechnung */
  annualReturn: number;
  onChangeReturn: (rate: number) => void;
  /** Bisherige Rendite des Depots pro Jahr, nur zum Vergleich */
  historicReturn: number | null;
}

/** Wunschbetrag festlegen, dazu die erkannten Sparpläne und die Hochrechnung im Detail. */
export function GoalSheet({ visible, onClose, savings, instruments, goal, projection, onChangeGoal, annualReturn, onChangeReturn, historicReturn }: Props) {
  const { theme, styles } = useStyles();
  const { hidden } = usePrivacy();
  const [input, setInput] = useState('');

  // Im Privatsphäre-Modus bleibt das Feld leer, damit der Betrag nicht lesbar ist
  useEffect(() => {
    if (visible) setInput(goal && !hidden ? String(Math.round(goal)) : '');
  }, [visible, goal, hidden]);

  const entered = Number(input);
  const valid = entered >= 100;
  const save = () => {
    Keyboard.dismiss();
    onChangeGoal(entered);
  };

  const planRows: DetailRow[] = savings.plans.map((p) => ({
    label: instruments.find((i) => i.isin === p.isin)?.shortName ?? p.isin,
    hint: p.source === 'auto' ? 'pro Monat · automatisch erkannt' : `von dir markiert · letzter Kauf am ${dayMonth(p.lastBuy)}`,
    value: eur(p.rate),
    private: true,
  }));
  const name = (isin: string) => instruments.find((i) => i.isin === isin)?.shortName ?? isin;
  const inactiveRows: DetailRow[] = savings.inactive.map((p) => ({
    label: name(p.isin),
    hint: p.lastBuy ? `markiert, aber seit ${monthYear(p.lastBuy)} kein Kauf mehr` : 'markiert, aber noch kein Kauf',
    value: '–',
    color: theme.warn,
  }));
  const step = (delta: number) => onChangeReturn(Math.min(MAX_RETURN, Math.max(0, Math.round((annualReturn + delta) / RETURN_STEP) * RETURN_STEP)));
  const stepButton = (icon: 'remove' | 'add', delta: number, disabled: boolean) => (
    <Pressable
      onPress={() => step(delta)}
      disabled={disabled}
      hitSlop={8}
      accessibilityLabel={icon === 'add' ? 'Rendite erhöhen' : 'Rendite senken'}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.chip, opacity: disabled ? 0.35 : pressed ? 0.6 : 1 })}
    >
      <Ionicons name={icon} size={22} color={theme.text} />
    </Pressable>
  );
  const none = '–';
  const projectionRows: DetailRow[] = projection
    ? [
        { label: 'Erreicht', value: percent(projection.progress) },
        { label: 'Es fehlen noch', value: eur(projection.remaining), private: true },
        {
          label: `Mit ${shortPercent(annualReturn)} Rendite im Jahr`,
          hint: 'deine Annahme, kein Versprechen',
          value: projection.remaining <= 0 ? 'erreicht' : projection.withReturn ? monthName(projection.withReturn) : 'über 50 Jahre',
        },
        {
          label: 'Ohne Kursgewinne',
          hint: 'nur durch deine Sparrate',
          value: projection.remaining <= 0 ? 'erreicht' : projection.withoutReturn ? monthName(projection.withoutReturn) : none,
        },
      ]
    : [];

  return (
    <Sheet visible={visible} onClose={onClose} title="Sparen & Ziel">
      <View style={[styles.card, { gap: 10 }]}>
        <Text style={[styles.label, { fontWeight: '600' }]}>Wunschbetrag für dein Depot</Text>
        <View style={[styles.row, { gap: 10 }]}>
          <TextInput
            style={{ flex: 1, backgroundColor: theme.background, color: theme.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 }}
            value={input}
            onChangeText={(v) => setInput(v.replace(/\D/g, '').slice(0, 9))}
            keyboardType="number-pad"
            placeholder={goal && hidden ? 'Neuen Betrag eingeben' : 'z. B. 100000'}
            placeholderTextColor={theme.muted}
          />
          <Text style={[styles.text, { color: theme.muted }]}>€</Text>
        </View>
        <Pressable
          disabled={!valid}
          onPress={save}
          style={({ pressed }) => ({ backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: !valid ? 0.4 : pressed ? 0.7 : 1 })}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{goal ? 'Ziel ändern' : 'Ziel festlegen'}</Text>
        </Pressable>
        {goal ? (
          <Pressable onPress={() => onChangeGoal(null)} style={{ paddingVertical: 6, alignItems: 'center' }}>
            <Text style={{ color: theme.negative, fontSize: 15, fontWeight: '600' }}>Ziel entfernen</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.card, { gap: 10 }]}>
        <Text style={[styles.label, { fontWeight: '600' }]}>Angenommene Rendite im Jahr</Text>
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          {stepButton('remove', -RETURN_STEP, annualReturn <= 1e-9)}
          <Text style={[styles.number, { fontSize: 24, fontWeight: '700', color: theme.text }]}>{shortPercent(annualReturn)}</Text>
          {stepButton('add', RETURN_STEP, annualReturn >= MAX_RETURN - 1e-9)}
        </View>
        <Text style={styles.small}>
          Damit rechnet die App in die Zukunft. Aktien-ETFs brachten langfristig im Schnitt etwa 5 bis 7 % im Jahr, einzelne Jahre weichen stark ab.
          {historicReturn !== null ? ` Dein Depot bisher: ${pct(historicReturn)} im Jahr.` : ''}
        </Text>
      </View>

      {projectionRows.length > 0 && (
        <>
          <Text style={[styles.label, { fontWeight: '600', paddingHorizontal: 4, marginTop: 8 }]}>Hochrechnung</Text>
          <DetailRows rows={projectionRows} />
        </>
      )}

      <Text style={[styles.label, { fontWeight: '600', paddingHorizontal: 4, marginTop: 8 }]}>Sparpläne</Text>
      {planRows.length + inactiveRows.length > 0 ? (
        <DetailRows rows={[...planRows, ...inactiveRows, { label: 'Zusammen', hint: 'pro Monat', value: eur(savings.monthlyRate), private: true }]} />
      ) : (
        <View style={styles.card}>
          <Text style={[styles.text, { color: theme.muted }]}>Keine regelmäßigen Käufe erkannt. Die Hochrechnung rechnet deshalb ohne Sparrate.</Text>
        </View>
      )}

      <DetailRows rows={[{ label: 'Dieses Jahr eingezahlt', hint: 'alle Käufe zusammen, auch Einzelkäufe', value: eur(savings.investedThisYear), private: true }]} />

      <Text style={[styles.small, { paddingHorizontal: 4 }]}>
        Die App erkennt einen Sparplan selbst, sobald du ein Wertpapier in mindestens drei der letzten vier Monate für einen ähnlichen Betrag gekauft hast. Einen neuen
        Sparplan kannst du vorab in den Details der Position markieren. Die Hochrechnung ist eine grobe Schätzung: Kurse schwanken, und niemand kennt die künftige
        Rendite.
      </Text>
    </Sheet>
  );
}
