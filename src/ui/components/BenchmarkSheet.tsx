import { Pressable, Text, View } from 'react-native';
import { PeriodResult } from '../../finance/performance';
import { BENCHMARKS, benchmarkByKey } from '../../market/yahoo';
import { eur, monthYear, pct, signedEur } from '../format';
import { tapFeedback } from '../haptics';
import { PrivateText } from '../privacy';
import { RichText } from '../RichText';
import { Sheet } from '../Sheet';
import { font, radius, signColor, useStyles } from '../styles';
import { DetailRows } from './DetailRows';

interface Props {
  visible: boolean;
  onClose: () => void;
  result: PeriodResult;
  benchmark: NonNullable<PeriodResult['benchmark']>;
  name: string;
  periodLabel: string;
  /** Gewählter Index (Schlüssel aus BENCHMARKS); fehlt bei Demo-Daten, dann gibt es keine Auswahl */
  choiceKey?: string;
  onChoose?: (key: string) => void;
}

export function BenchmarkSheet({ visible, onClose, result, benchmark, name, periodLabel, choiceKey, onChoose }: Props) {
  const { theme, styles } = useStyles();
  const diff = result.endValue - benchmark.endValue;
  // Nach einem Wechsel laufen die Yahoo-Abrufe im Hintergrund; solange zeigen die Zahlen noch den alten Index
  const pending = choiceKey !== undefined && benchmarkByKey(choiceKey).name !== name;

  return (
    <Sheet visible={visible} onClose={onClose} title={`Vergleich mit ${name}`}>
      {choiceKey !== undefined && onChoose && (
        <View style={{ gap: 6 }}>
          <View style={[styles.row, { flexWrap: 'wrap', gap: 8 }]}>
            {BENCHMARKS.map((b) => {
              const active = benchmarkByKey(choiceKey).key === b.key;
              return (
                <Pressable
                  key={b.key}
                  onPress={() => {
                    if (active) return;
                    tapFeedback();
                    onChoose(b.key);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => ({
                    paddingVertical: 7,
                    paddingHorizontal: 12,
                    borderRadius: radius.control,
                    backgroundColor: active ? theme.accent : theme.chip,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ color: active ? theme.onAccent : theme.text, fontSize: font.chip, fontWeight: '600' }}>{b.name}</Text>
                </Pressable>
              );
            })}
          </View>
          {pending && <Text style={styles.small}>Kurse für {benchmarkByKey(choiceKey).name} werden geladen – die Zahlen unten zeigen noch {name}.</Text>}
        </View>
      )}
      <Text style={styles.label}>{periodLabel}</Text>
      <View style={[styles.row, { gap: 12 }]}>
        {[
          { label: 'Dein Depot', color: theme.accent, irr: result.irr, value: result.endValue },
          { label: name, color: theme.benchmark, irr: benchmark.irr, value: benchmark.endValue },
        ].map((c) => (
          <View key={c.label} style={[styles.card, { flex: 1, gap: 4 }]}>
            <Text style={[styles.label, { color: c.color, fontWeight: '600' }]}>{c.label}</Text>
            <Text style={[styles.number, { fontSize: font.stat, fontWeight: '700', color: theme.text }]}>{pct(c.irr)}</Text>
            <View style={[styles.row, { gap: 4 }]}>
              <Text style={styles.small}>p.a. ·</Text>
              <PrivateText style={styles.small}>{eur(c.value)}</PrivateText>
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.card, { flexDirection: 'row' }]}>
        <RichText
          style={styles.text}
          amountStyle={{ fontWeight: '700', color: signColor(theme, diff) }}
          // Aus deiner Sicht formuliert, damit Grün/Rot zum Satz passt
          parts={['Du hast heute', { amount: Math.abs(diff) }, `${diff >= 0 ? 'mehr' : 'weniger'}, als wenn du jeden Euro in den ${name} gesteckt hättest.`]}
        />
      </View>

      <DetailRows
        rows={[
          result.startValue > 0
            ? { label: `Startwert (${monthYear(result.from)})`, value: eur(result.startValue), private: true }
            : { label: 'Erster Kauf', value: monthYear(result.from) },
          { label: 'Netto eingezahlt', value: signedEur(result.netInflow), private: true },
          { label: 'Gewinn Depot', value: signedEur(result.gain), color: signColor(theme, result.gain), private: true },
          { label: `Gewinn ${name}`, value: signedEur(benchmark.gain), color: signColor(theme, benchmark.gain), private: true },
        ]}
      />

      <Text style={[styles.small, { lineHeight: 17, paddingHorizontal: 4 }]}>
        Rendite p.a. ist geldgewichtet (IRR): Sie berücksichtigt, wann und wie viel du eingezahlt hast, inklusive Gebühren
        und Ausschüttungen. Das Vergleichsdepot kauft und verkauft zu denselben Zeitpunkten, mit denselben Beträgen und
        Gebühren, nur eben den {name}.
      </Text>
    </Sheet>
  );
}
