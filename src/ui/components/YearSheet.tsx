import { Text, View } from 'react-native';
import type { PauschaleEstimate } from '../../finance/vorabpauschale';
import type { YearsOverview } from '../../finance/years';
import { eur, pct, signedEur } from '../format';
import { PrivateText } from '../privacy';
import { Sheet } from '../Sheet';
import { signColor, useStyles } from '../styles';
import { DetailRow, DetailRows } from './DetailRows';

interface Props {
  visible: boolean;
  onClose: () => void;
  overview: YearsOverview;
  /** Name des Vergleichsindex; null, wenn es keinen gibt */
  benchmarkName: string | null;
  /** Vorschau auf die Vorabpauschale des relevanten Jahres; null = nicht berechenbar */
  vorab: PauschaleEstimate | null;
}

/** Gewinn seit Beginn, aufgeteilt in Buchgewinn, realisiert und Ausschüttungen, dazu jedes Jahr einzeln. */
export function YearSheet({ visible, onClose, overview, benchmarkName, vorab }: Props) {
  const { theme, styles } = useStyles();
  const { years, total } = overview;

  const totalRows: DetailRow[] = [
    { label: 'Buchgewinn', hint: 'Anteile, die noch im Depot liegen', value: signedEur(total.open), color: signColor(theme, total.open), private: true },
    ...(total.realized !== 0
      ? [{ label: 'Realisiert', hint: 'Gewinn aus Verkäufen, vor Steuern', value: signedEur(total.realized), color: signColor(theme, total.realized), private: true }]
      : []),
    ...(total.dividends > 0 ? [{ label: 'Ausschüttungen', hint: 'netto, wie gutgeschrieben', value: signedEur(total.dividends), color: theme.positive, private: true }] : []),
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title="Jahresübersicht">
      <View style={[styles.card, { gap: 4 }]}>
        <Text style={styles.label}>Gewinn seit Beginn</Text>
        <PrivateText style={[styles.number, { fontSize: 34, fontWeight: '700', color: signColor(theme, total.gain) }]}>{signedEur(total.gain)}</PrivateText>
        <Text style={styles.small}>Setzt sich so zusammen:</Text>
      </View>
      <DetailRows rows={totalRows} />

      {years.map((y) => {
        const rows: DetailRow[] = [
          { label: 'Rendite', hint: 'Kursentwicklung, unabhängig von Käufen und Verkäufen', value: pct(y.twr), color: signColor(theme, y.twr) },
          ...(benchmarkName && y.benchmarkReturn !== null ? [{ label: benchmarkName, value: pct(y.benchmarkReturn), color: theme.benchmark }] : []),
          { label: 'Gewinn', value: signedEur(y.gain), color: signColor(theme, y.gain), private: true },
          { label: 'Gekauft', value: eur(y.bought), private: true },
          ...(y.sold > 0
            ? [
                { label: 'Verkauft', value: eur(y.sold), color: theme.sale, private: true },
                { label: 'davon realisierter Gewinn', hint: 'Erlös minus Einstand, vor Steuern', value: signedEur(y.realized), color: signColor(theme, y.realized), private: true },
              ]
            : []),
          ...(y.dividends > 0 ? [{ label: 'Ausschüttungen', value: eur(y.dividends), private: true }] : []),
          // Vorschau, damit das Verrechnungskonto im Januar gedeckt ist
          ...(vorab && vorab.year === y.year && vorab.tax >= 0.5
            ? [{ label: `Vorabpauschale (Abbuchung Januar ${y.year + 1})`, hint: 'Schätzung: Steuer auf thesaurierte Erträge, ohne Kirchensteuer und Freibetrag', value: `≈ ${eur(vorab.tax)}`, private: true }]
            : []),
          { label: y.running ? 'Wert heute' : 'Wert am Jahresende', value: eur(y.endValue), private: true },
        ];
        return (
          <View key={y.year} style={{ gap: 8, marginTop: 8 }}>
            <View style={[styles.row, { gap: 8, paddingHorizontal: 4 }]}>
              <Text style={[styles.number, { fontSize: 20, fontWeight: '700', color: theme.text }]}>{y.year}</Text>
              {y.running && <Text style={styles.label}>bisher</Text>}
            </View>
            <DetailRows rows={rows} />
          </View>
        );
      })}

      <Text style={[styles.small, { paddingHorizontal: 4 }]}>
        Realisierte Gewinne sind nach dem Prinzip „zuerst gekauft, zuerst verkauft“ gerechnet, wie es auch steuerlich gilt. Steuern und Freibeträge kennt die App nicht.
      </Text>
    </Sheet>
  );
}
