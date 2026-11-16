import { Switch, Text, View } from 'react-native';
import { PositionResult } from '../../finance/performance';
import type { PlanStatus } from '../../finance/savings';
import { dayMonth, eur, monthYear, pct, percent, price, quantity, signedEur } from '../format';
import { LineChart } from '../LineChart';
import { PrivateText } from '../privacy';
import { Sheet } from '../Sheet';
import { font, radius, signColor, useStyles } from '../styles';
import { DetailRows } from './DetailRows';
import { SecurityIds } from './SecurityIds';

interface Props {
  position: PositionResult | null;
  color: string;
  /** Einstandswert laut comdirect; null bei Demo-Daten */
  bankCost: number | null;
  /** Bisher bezahlte Steuer auf die Vorabpauschale; null = keine bekannt */
  prepaidTax: number | null;
  /** Sparplan-Status dieser Position */
  plan: PlanStatus;
  onMarkPlan: (marked: boolean) => void;
  onClose: () => void;
}

export function PositionSheet({ position, color, bankCost, prepaidTax, plan, onMarkPlan, onClose }: Props) {
  const { theme, styles } = useStyles();
  if (!position) return null;
  const p = position;
  const gainStyle = [styles.number, { fontSize: font.button, fontWeight: '600' as const, color: signColor(theme, p.irr) }];
  // Verkäufe markieren, damit der Rückgang nicht wie ein Kurseinbruch aussieht
  const sales = p.series.flatMap((s, i) => (s.sold > 0 && i > 0 ? [i] : []));

  return (
    <Sheet visible onClose={onClose} title={p.instrument.name}>
      <View style={[styles.card, { gap: 4 }]}>
        <Text style={styles.label}>
          {p.instrument.kind} · {percent(p.share)} vom Depot
        </Text>
        <SecurityIds isin={p.instrument.isin} wkn={p.instrument.wkn} />
        <PrivateText style={[styles.number, { fontSize: font.heroSheet, fontWeight: '700', color: theme.text }]}>{eur(p.value)}</PrivateText>
        <View style={styles.row}>
          <PrivateText style={gainStyle}>{signedEur(p.gain)}</PrivateText>
          <Text style={gainStyle}> · {pct(p.irr)} p.a.</Text>
        </View>
        <View style={{ marginTop: 12 }}>
          <LineChart
            theme={theme}
            compact
            height={90}
            dates={p.series.map((s) => s.date)}
            series={[{ values: p.series.map((s) => s.value), color }]}
            events={sales.length ? { series: 0, indices: sales, color: theme.sale } : undefined}
          />
        </View>
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <Text style={styles.small}>{monthYear(p.series[0].date)}</Text>
          {sales.length > 0 && (
            <View style={[styles.row, { gap: 5 }]}>
              <View style={{ width: 8, height: 8, borderRadius: radius.tiny, backgroundColor: theme.sale }} />
              <Text style={styles.small}>Verkauf</Text>
            </View>
          )}
          <Text style={styles.small}>heute</Text>
        </View>
      </View>

      <DetailRows
        rows={[
          { label: 'Stück', value: quantity(p.quantity), private: true },
          { label: 'Kurs', value: price(p.price) },
          ...(bankCost !== null
            ? [
                // Bankdaten: Einstandswert enthält die Gebühren, die die API sonst nicht einzeln liefert
                { label: 'Einstandswert', value: eur(bankCost), private: true },
                { label: 'Gewinn seit Kauf (comdirect)', value: signedEur(p.value - bankCost), color: signColor(theme, p.value - bankCost), private: true },
                { label: 'Gewinn seit Kauf in %', value: pct(bankCost > 0 ? (p.value - bankCost) / bankCost : null), color: signColor(theme, p.value - bankCost) },
                // comdirect rechnet Ausschüttungen nicht in „seit Kauf“ ein; sie stecken aber in der Rendite der App
                ...(p.dividends > 0 ? [{ label: 'Erhaltene Ausschüttungen (netto)', value: eur(p.dividends), private: true }] : []),
              ]
            : [
                { label: 'Gewinn seit Erstkauf', value: signedEur(p.gain), color: signColor(theme, p.gain), private: true },
                ...(p.dividends > 0 ? [{ label: 'davon Ausschüttungen', value: eur(p.dividends), private: true }] : []),
                { label: 'Gezahlte Gebühren', value: eur(p.fees), private: true },
              ]),
          ...(p.realized !== null
            ? [{ label: 'Realisierter Gewinn', hint: 'aus bisherigen Verkäufen, vor Steuern', value: signedEur(p.realized), color: signColor(theme, p.realized), private: true }]
            : []),
          // Vorauszahlung, keine Kosten: wird beim Verkauf auf die Steuer angerechnet
          ...(prepaidTax && prepaidTax > 0.005
            ? [{ label: 'Vorabpauschale bezahlt', hint: 'Steuer, wird beim Verkauf angerechnet', value: eur(prepaidTax), private: true }]
            : []),
        ]}
      />

      {/* Sparplan: automatisch erkannt oder von dir markiert; die App prüft weiter, ob wirklich gekauft wird */}
      <View style={[styles.card, { gap: 6 }]}>
        <View style={[styles.row, { justifyContent: 'space-between', gap: 12 }]}>
          <Text style={[styles.text, { fontWeight: '600', flex: 1 }]}>Sparplan</Text>
          <Switch value={plan.kind !== 'none'} disabled={plan.kind === 'auto'} onValueChange={onMarkPlan} trackColor={{ true: theme.accent }} />
        </View>
        {plan.kind === 'auto' && (
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            <Text style={styles.small}>Automatisch erkannt: </Text>
            <PrivateText style={styles.small}>{eur(plan.rate)}</PrivateText>
            <Text style={styles.small}> im Monat, letzter Kauf am {dayMonth(plan.lastBuy)}</Text>
          </View>
        )}
        {plan.kind === 'manual' && (
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            <Text style={styles.small}>Von dir markiert und aktiv: </Text>
            <PrivateText style={styles.small}>{eur(plan.rate)}</PrivateText>
            <Text style={styles.small}> beim letzten Kauf am {dayMonth(plan.lastBuy)}</Text>
          </View>
        )}
        {plan.kind === 'inactive' && (
          <Text style={[styles.small, { color: theme.warn }]}>
            Von dir markiert, aber {plan.lastBuy ? `seit ${monthYear(plan.lastBuy)} kein Kauf mehr` : 'noch kein Kauf'}. Zählt deshalb nicht zur Sparrate.
          </Text>
        )}
        {plan.kind === 'none' && (
          <Text style={styles.small}>
            Regelmäßige Käufe erkennt die App nach der dritten Ausführung selbst. Bei einem neuen Sparplan kannst du ihn hier schon vorher markieren.
          </Text>
        )}
      </View>
    </Sheet>
  );
}
