import { useEffect, useState } from 'react';
import { chartModePreference } from '../../data/store';
import { Pressable, Text, View } from 'react-native';
import { SeriesPoint } from '../../finance/performance';
import { compactEur, eur, monthYear, pct } from '../format';
import { BenchmarkPill } from './BenchmarkPill';
import { ChartSeries, LineChart } from '../LineChart';
import { PrivateText, usePrivacy } from '../privacy';
import { useStyles } from '../styles';

interface Props {
  series: SeriesPoint[];
  /** null blendet die Vergleichslinie aus */
  benchmarkName: string | null;
  periods: readonly { label: string }[];
  periodIndex: number;
  /** false = keine Daten so weit zurück; Knopf ausgegraut */
  available: readonly boolean[];
  /** Hinweis unter den Zeiträumen, z. B. wie weit die Historie reicht */
  historyHint: string | null;
  /** Vergleich mit dem Index am Fuß der Karte; null blendet die Zeile aus */
  benchmark: { irr: number | null; benchmarkIrr: number | null; name: string; onPress: () => void } | null;
  onPeriodChange: (index: number) => void;
}

const HEADER_HEIGHT = 22;

const Dot = ({ color }: { color: string }) => <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />;

export function ChartCard({ series, benchmarkName, periods, periodIndex, available, historyHint, benchmark, onPeriodChange }: Props) {
  const { theme, styles } = useStyles();
  const { hidden } = usePrivacy();
  const [active, setActive] = useState<number | null>(null);
  // Wert in Euro oder zeitgewichtete Rendite in Prozent (Käufe/Verkäufe verschieben die Linie dann nicht)
  const [mode, setModeState] = useState<'value' | 'return'>('value');
  // Letzte Wahl merken
  useEffect(() => {
    chartModePreference.get().then(setModeState).catch(() => {});
  }, []);
  const setMode = (next: 'value' | 'return') => {
    setModeState(next);
    chartModePreference.set(next).catch(() => {});
  };
  const asReturn = mode === 'return';
  const point = active !== null ? series[active] : null;

  const lines: ChartSeries[] = [];
  if (asReturn) {
    if (benchmarkName) lines.push({ values: series.map((p) => p.benchmarkReturn ?? 0), color: theme.benchmark });
    lines.push({ values: series.map((p) => p.twr), color: theme.accent });
  } else {
    lines.push({ values: series.map((p) => p.invested), color: theme.invested, dashed: true });
    if (benchmarkName) lines.push({ values: series.map((p) => p.benchmark ?? 0), color: theme.benchmark });
    lines.push({ values: series.map((p) => p.depot), color: theme.accent });
  }
  const sales = asReturn ? [] : series.flatMap((p, i) => (p.sold > 0 && i > 0 ? [i] : []));
  const legend = [
    { color: theme.accent, label: 'Depot' },
    ...(benchmarkName ? [{ color: theme.benchmark, label: benchmarkName }] : []),
    ...(asReturn ? [] : [{ color: theme.invested, label: 'Eingesetzt' }]),
    ...(sales.length ? [{ color: theme.sale, label: 'Verkauf' }] : []),
  ];

  return (
    <View style={styles.card}>
      {/* Feste Zeile über dem Chart: Legende, beim Ziehen die Werte unter dem Finger */}
      <View style={[styles.row, { height: HEADER_HEIGHT, gap: 14 }]}>
        {point && asReturn ? (
          <>
            <Text style={[styles.small, { fontWeight: '700', color: theme.text }]}>{monthYear(point.date)}</Text>
            {[
              { color: theme.accent, value: point.twr },
              ...(point.benchmarkReturn !== null && benchmarkName ? [{ color: theme.benchmark, value: point.benchmarkReturn }] : []),
            ].map((row) => (
              <View key={row.color} style={[styles.row, { gap: 5 }]}>
                <Dot color={row.color} />
                <Text style={[styles.small, styles.number, { fontWeight: '600', color: theme.text }]}>{pct(row.value)}</Text>
              </View>
            ))}
          </>
        ) : point ? (
          <>
            <Text style={[styles.small, { fontWeight: '700', color: theme.text }]}>{monthYear(point.date)}</Text>
            {[
              { color: theme.accent, value: point.depot },
              ...(point.benchmark !== null ? [{ color: theme.benchmark, value: point.benchmark }] : []),
            ].map((row) => (
              <View key={row.color} style={[styles.row, { gap: 5 }]}>
                <Dot color={row.color} />
                <PrivateText style={[styles.small, styles.number, { fontWeight: '600', color: theme.text }]}>{eur(row.value)}</PrivateText>
              </View>
            ))}
            {/* Bei einem Verkauf statt „Eingesetzt“ den Erlös zeigen: erklärt den Knick in der Linie */}
            {point.sold > 0 ? (
              <View style={[styles.row, { gap: 5 }]}>
                <Dot color={theme.sale} />
                <PrivateText style={[styles.small, styles.number, { fontWeight: '600', color: theme.sale }]}>{`Verkauf −${eur(point.sold)}`}</PrivateText>
              </View>
            ) : (
              <View style={[styles.row, { gap: 5 }]}>
                <Dot color={theme.invested} />
                <PrivateText style={[styles.small, styles.number]}>{eur(point.invested)}</PrivateText>
              </View>
            )}
          </>
        ) : (
          legend.map((l) => (
            <View key={l.label} style={[styles.row, { gap: 5 }]}>
              <Dot color={l.color} />
              <Text style={styles.small}>{l.label}</Text>
            </View>
          ))
        )}
      </View>

      <LineChart
        theme={theme}
        dates={series.map((p) => p.date)}
        formatY={asReturn ? pct : compactEur}
        series={lines}
        onActiveChange={setActive}
        blurValues={hidden && !asReturn}
        markExtremesOf={lines.length - 1}
        formatExtreme={asReturn ? pct : eur}
        events={sales.length ? { series: lines.length - 1, indices: sales, color: theme.sale } : undefined}
      />

      <View style={[styles.row, { gap: 8 }]}>
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.chip, borderRadius: 10, padding: 3 }}>
        {periods.map((p, i) => (
          <Pressable
            key={p.label}
            disabled={!available[i]}
            onPress={() => onPeriodChange(i)}
            accessibilityState={{ selected: i === periodIndex, disabled: !available[i] }}
            style={{ flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center', backgroundColor: i === periodIndex ? theme.card : 'transparent', opacity: available[i] ? 1 : 0.35 }}
          >
            <Text style={{ fontSize: 14, color: i === periodIndex ? theme.text : theme.muted, fontWeight: i === periodIndex ? '600' : '500' }}>
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', backgroundColor: theme.chip, borderRadius: 10, padding: 3 }}>
        {(['value', 'return'] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            accessibilityLabel={m === 'value' ? 'Wert in Euro' : 'Rendite in Prozent'}
            accessibilityState={{ selected: mode === m }}
            style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', backgroundColor: mode === m ? theme.card : 'transparent' }}
          >
            <Text style={{ fontSize: 14, color: mode === m ? theme.text : theme.muted, fontWeight: mode === m ? '600' : '500' }}>
              {m === 'value' ? '€' : '%'}
            </Text>
          </Pressable>
        ))}
      </View>
      </View>
      {benchmark && <BenchmarkPill irr={benchmark.irr} benchmarkIrr={benchmark.benchmarkIrr} name={benchmark.name} onPress={benchmark.onPress} />}
      {historyHint && <Text style={[styles.small, { textAlign: 'center' }]}>{historyHint}</Text>}
    </View>
  );
}
