import { Instrument, PortfolioData, PriceHistory, Transaction } from '../types';
import { Flow, xirr } from './xirr';
import { realizedSales } from './years';

export const toDate = (iso: string) => new Date(iso + 'T00:00:00Z');

/** Letzter bekannter Kurs an oder vor dem Datum. */
export function priceAt(history: PriceHistory, isin: string, date: string): number {
  const points = history[isin];
  if (!points?.length) throw new Error(`Keine Kurse für ${isin}`);
  let price = points[0].price;
  for (const p of points) {
    if (p.date > date) break;
    price = p.price;
  }
  return price;
}

/** Zahlungsstrom aus Anlegersicht: negativ = Geld ins Depot, positiv = Geld heraus. */
export function cashflow(tx: Transaction): number {
  switch (tx.type) {
    case 'buy':
      return -(tx.amount + tx.fees);
    case 'sell':
      return tx.amount - tx.fees;
    case 'dividend':
      return tx.amount;
  }
}

/**
 * Wie viel Euro im Schattendepot gekauft (positiv) bzw. verkauft (negativ) werden.
 * Gebühren fallen wie im echten Depot an, damit nur die Wertpapierwahl verglichen wird.
 */
function benchmarkTrade(tx: Transaction): number {
  return tx.type === 'buy' ? tx.amount : -tx.amount;
}

export function holdingsAt(txs: Transaction[], date: string, isin?: string): Map<string, number> {
  const holdings = new Map<string, number>();
  for (const tx of txs) {
    if (tx.date > date || (isin && tx.isin !== isin)) continue;
    const delta = tx.type === 'buy' ? tx.quantity : tx.type === 'sell' ? -tx.quantity : 0;
    holdings.set(tx.isin, (holdings.get(tx.isin) ?? 0) + delta);
  }
  return holdings;
}

export function valueAt(txs: Transaction[], history: PriceHistory, date: string, isin?: string): number {
  let value = 0;
  for (const [id, quantity] of holdingsAt(txs, date, isin)) {
    if (quantity > 1e-9) value += quantity * priceAt(history, id, date);
  }
  return value;
}

const sortByDate = (txs: Transaction[]) => [...txs].sort((a, b) => a.date.localeCompare(b.date));

export interface PeriodResult {
  from: string;
  to: string;
  startValue: number;
  endValue: number;
  netInflow: number; // eingezahlt minus entnommen (inkl. Ausschüttungen) im Zeitraum
  gain: number;
  irr: number | null;
  /** null, wenn keine Kurse für einen Vergleichsindex vorliegen (z. B. bei echten comdirect-Daten) */
  benchmark: { endValue: number; gain: number; irr: number | null } | null;
}

/** Alle Tage mit bekannten Kursen, sortiert; Grundlage für Chart und Rücksetzer. */
export function priceDates(prices: PriceHistory): string[] {
  return [...new Set(Object.values(prices).flatMap((points) => points.map((p) => p.date)))].sort();
}

/**
 * Rendite eines Zeitraums. Der Benchmark ist ein Schattendepot: Es startet mit
 * demselben Wert und bekommt exakt dieselben Ein- und Auszahlungen, nur dass
 * jeder Euro in den Benchmark fließt.
 */
export function analyzePeriod(data: PortfolioData, from: string | null): PeriodResult {
  const { prices, benchmark, asOf: to } = data;
  const txs = sortByDate(data.transactions);
  const start = from ?? txs[0]?.date ?? to;
  const inPeriod = txs.filter((t) => (from ? t.date > from : true) && t.date <= to);

  const startValue = from ? valueAt(txs, prices, from) : 0;
  const endValue = valueAt(txs, prices, to);

  const flows: Flow[] = [];
  if (startValue > 0) flows.push({ date: toDate(start), amount: -startValue });
  let netInflow = 0;
  let benchUnits = benchmark && startValue > 0 ? startValue / priceAt(prices, benchmark.isin, start) : 0;
  for (const tx of inPeriod) {
    const cf = cashflow(tx);
    netInflow -= cf;
    flows.push({ date: toDate(tx.date), amount: cf });
    if (benchmark) benchUnits += benchmarkTrade(tx) / priceAt(prices, benchmark.isin, tx.date);
  }
  const benchEnd = benchmark ? benchUnits * priceAt(prices, benchmark.isin, to) : 0;

  return {
    from: start,
    to,
    startValue,
    endValue,
    netInflow,
    gain: endValue - startValue - netInflow,
    irr: xirr([...flows, { date: toDate(to), amount: endValue }]),
    benchmark: benchmark
      ? {
          endValue: benchEnd,
          gain: benchEnd - startValue - netInflow,
          irr: xirr([...flows, { date: toDate(to), amount: benchEnd }]),
        }
      : null,
  };
}

export interface SeriesPoint {
  date: string;
  depot: number;
  benchmark: number | null;
  invested: number;
  /** Verkaufserlöse seit dem vorherigen Punkt; der Depotwert sinkt dadurch, ohne dass Kurse fallen */
  sold: number;
  /**
   * Zeitgewichtete Rendite seit Beginn des Zeitraums (0,12 = +12 %): Käufe und Verkäufe
   * verschieben sie nicht, nur Kursänderungen (und Gebühren).
   */
  twr: number;
  /** Kursentwicklung des Vergleichsindex seit Beginn des Zeitraums */
  benchmarkReturn: number | null;
}

/** Verlauf von Depot, Schattendepot und eingesetztem Kapital an allen Tagen mit Kursen. */
export function buildSeries(data: PortfolioData, from: string | null): SeriesPoint[] {
  const { prices, benchmark, asOf: to } = data;
  const txs = sortByDate(data.transactions);
  const start = from ?? txs[0]?.date ?? to;

  const dates = priceDates(prices).filter((d) => d > start && d < to);
  dates.unshift(start);
  dates.push(to);

  const startValue = from ? valueAt(txs, prices, from) : 0;
  let benchUnits = benchmark && startValue > 0 ? startValue / priceAt(prices, benchmark.isin, start) : 0;
  let invested = startValue;
  // Bewegungen bis zum Startdatum stecken bereits im Startwert
  let i = 0;
  if (from) while (i < txs.length && txs[i].date <= from) i++;
  const benchStart = benchmark ? priceAt(prices, benchmark.isin, start) : 0;

  // Zeitgewichtete Rendite: Teilperioden enden an jedem Umsatztag und an jedem Punkt des Charts.
  // Bestand wird mitgeführt, damit der Wert an Umsatztagen ohne Chartpunkt bekannt ist.
  const held = holdingsAt(txs.slice(0, i), start);
  const valueOf = (date: string) => {
    let v = 0;
    for (const [id, q] of held) if (q > 1e-9) v += q * priceAt(prices, id, date);
    return v;
  };
  let growth = 1;
  let last = from ? valueOf(start) : 0;
  const chain = (value: number, inflow: number) => {
    if (last > 1e-9) growth *= (value - inflow) / last;
    last = value;
  };

  return dates.map((date) => {
    let sold = 0;
    while (i < txs.length && txs[i].date <= date) {
      // Alle Umsätze eines Tages gemeinsam: Wert danach minus Zufluss, bewertet zum Kurs dieses Tages
      const day = txs[i].date;
      let inflow = 0;
      while (i < txs.length && txs[i].date === day) {
        const tx = txs[i];
        if (tx.type === 'sell') sold += tx.amount;
        inflow -= cashflow(tx);
        invested -= cashflow(tx);
        const delta = tx.type === 'buy' ? tx.quantity : tx.type === 'sell' ? -tx.quantity : 0;
        held.set(tx.isin, (held.get(tx.isin) ?? 0) + delta);
        if (benchmark) benchUnits += benchmarkTrade(tx) / priceAt(prices, benchmark.isin, tx.date);
        i++;
      }
      chain(valueOf(day), inflow);
    }
    const depot = valueAt(txs, prices, date);
    chain(depot, 0);
    return {
      date,
      depot,
      benchmark: benchmark ? benchUnits * priceAt(prices, benchmark.isin, date) : null,
      invested,
      sold,
      twr: growth - 1,
      benchmarkReturn: benchmark && benchStart > 0 ? priceAt(prices, benchmark.isin, date) / benchStart - 1 : null,
    };
  });
}

export interface PositionResult {
  instrument: Instrument;
  quantity: number;
  price: number;
  value: number;
  share: number;
  gain: number; // seit Erstkauf, inkl. Ausschüttungen und realisierter Gewinne
  irr: number | null;
  dividends: number;
  fees: number;
  /** Gewinn aus bisherigen Verkäufen gegenüber dem Einstand (FIFO); null, wenn nie verkauft wurde */
  realized: number | null;
  /** Wert seit Erstkauf; sold = Verkaufserlös seit dem vorherigen Punkt (für die Markierung im Chart) */
  series: { date: string; value: number; sold: number }[];
}

export function analyzePositions(data: PortfolioData): PositionResult[] {
  const { prices, asOf } = data;
  const total = valueAt(data.transactions, prices, asOf);

  return data.instruments
    .map((instrument) => {
      const txs = sortByDate(data.transactions.filter((t) => t.isin === instrument.isin));
      const quantity = holdingsAt(txs, asOf).get(instrument.isin) ?? 0;
      const price = priceAt(prices, instrument.isin, asOf);
      const value = quantity * price;
      const flows: Flow[] = txs.map((t) => ({ date: toDate(t.date), amount: cashflow(t) }));
      const first = txs[0]?.date ?? asOf;
      const sales = realizedSales(txs).sales;
      const dates = [first, ...prices[instrument.isin].map((p) => p.date).filter((d) => d > first && d < asOf), asOf];
      return {
        instrument,
        quantity,
        price,
        value,
        share: total > 0 ? value / total : 0,
        gain: value + flows.reduce((s, f) => s + f.amount, 0),
        irr: xirr([...flows, { date: toDate(asOf), amount: value }]),
        dividends: txs.filter((t) => t.type === 'dividend').reduce((s, t) => s + t.amount, 0),
        fees: txs.reduce((s, t) => s + t.fees, 0),
        realized: sales.length ? sales.reduce((s, x) => s + x.gain, 0) : null,
        series: dates.map((date, k) => ({
          date,
          value: valueAt(txs, prices, date),
          sold: k === 0 ? 0 : txs.filter((t) => t.type === 'sell' && t.date > dates[k - 1] && t.date <= date).reduce((s, t) => s + t.amount, 0),
        })),
      };
    })
    .filter((p) => p.quantity > 1e-9)
    .sort((a, b) => b.value - a.value);
}
