import { Text, View } from 'react-native';
import { PeriodResult } from '../../finance/performance';
import { eur, monthYear, pct, signedEur } from '../format';
import { PrivateText } from '../privacy';
import { RichText } from '../RichText';
import { Sheet } from '../Sheet';
import { font, signColor, useStyles } from '../styles';
import { DetailRows } from './DetailRows';

interface Props {
  visible: boolean;
  onClose: () => void;
  result: PeriodResult;
  benchmark: NonNullable<PeriodResult['benchmark']>;
  name: string;
  periodLabel: string;
}

export function BenchmarkSheet({ visible, onClose, result, benchmark, name, periodLabel }: Props) {
  const { theme, styles } = useStyles();
  const diff = result.endValue - benchmark.endValue;

  return (
    <Sheet visible={visible} onClose={onClose} title={`Vergleich mit ${name}`}>
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
