import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { shareTransactionsCsv, shareYearReport } from '../../data/backup';
import type { PauschaleEstimate } from '../../finance/vorabpauschale';
import type { YearsOverview } from '../../finance/years';
import type { PortfolioData } from '../../types';
import { eur, pct, signedEur } from '../format';
import { tapFeedback } from '../haptics';
import { PrivateText } from '../privacy';
import { Sheet } from '../Sheet';
import { font, radius, signColor, useStyles } from '../styles';
import { DetailRow, DetailRows } from './DetailRows';

interface Props {
  visible: boolean;
  onClose: () => void;
  overview: YearsOverview;
  /** Für die Exporte: Umsätze und Stand */
  data: PortfolioData;
  /** Name des Vergleichsindex; null, wenn es keinen gibt */
  benchmarkName: string | null;
  /** Vorschau auf die Vorabpauschale des relevanten Jahres; null = nicht berechenbar */
  vorab: PauschaleEstimate | null;
}

/** Gewinn seit Beginn, aufgeteilt in Buchgewinn, realisiert und Ausschüttungen, dazu jedes Jahr einzeln. */
export function YearSheet({ visible, onClose, overview, data, benchmarkName, vorab }: Props) {
  const { theme, styles } = useStyles();
  const { years, total } = overview;

  // Exporte laufen kurz im Hintergrund (PDF rendern, Datei schreiben); solange sind die Knöpfe gesperrt
  const [exporting, setExporting] = useState(false);
  const runExport = (job: () => Promise<void>) => async () => {
    tapFeedback();
    setExporting(true);
    try {
      await job();
    } catch (e) {
      Alert.alert('Teilen fehlgeschlagen', e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };
  const exportButton = (label: string, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      disabled={exporting}
      accessibilityRole="button"
      style={({ pressed }) => ({ flex: 1, backgroundColor: theme.chip, borderRadius: radius.control, paddingVertical: 11, alignItems: 'center', opacity: exporting ? 0.4 : pressed ? 0.6 : 1 })}
    >
      <Text style={{ color: theme.accent, fontSize: font.body, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );

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
        <PrivateText style={[styles.number, { fontSize: font.heroSheet, fontWeight: '700', color: signColor(theme, total.gain) }]}>{signedEur(total.gain)}</PrivateText>
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
              <Text style={[styles.number, { fontSize: font.statSmall, fontWeight: '700', color: theme.text }]}>{y.year}</Text>
              {y.running && <Text style={styles.label}>bisher</Text>}
            </View>
            <DetailRows rows={rows} />
          </View>
        );
      })}

      {/* Exporte über das Teilen-Menü, z. B. in Dateien sichern oder verschicken */}
      <View style={[styles.row, { gap: 10, marginTop: 8 }]}>
        {exportButton('Bericht (PDF)', runExport(() => shareYearReport(data, overview, benchmarkName)))}
        {exportButton('Umsätze (CSV)', runExport(() => shareTransactionsCsv(data)))}
      </View>

      <Text style={[styles.small, { paddingHorizontal: 4 }]}>
        Realisierte Gewinne sind nach dem Prinzip „zuerst gekauft, zuerst verkauft“ gerechnet, wie es auch steuerlich gilt. Steuern und Freibeträge kennt die App nicht.
      </Text>
    </Sheet>
  );
}
