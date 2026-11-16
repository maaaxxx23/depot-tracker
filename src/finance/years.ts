// Jahresübersicht und realisierte Gewinne.
// Realisiert wird nach FIFO gerechnet (zuerst gekauft = zuerst verkauft), so wie es in
// Deutschland auch steuerlich gilt. Steuern selbst kennt die App nicht.

import type { PortfolioData, Transaction } from '../types';
import { buildSeries, cashflow, valueAt } from './performance';

export interface RealizedSale {
  date: string;
  isin: string;
  /** Erlös nach Gebühren */
  proceeds: number;
  /** Einstand der verkauften Anteile inkl. Kaufgebühren */
  cost: number;
  gain: number;
}

export interface Realized {
  sales: RealizedSale[];
  /** Einstand der Anteile, die noch im Depot liegen, je ISIN */
  openCost: Map<string, number>;
}

/** Käufe vor Verkäufen desselben Tages, damit ein Verkauf immer auf vorhandene Anteile trifft. */
const ORDER = { buy: 0, dividend: 1, sell: 2 } as const;

export function realizedSales(transactions: Transaction[]): Realized {
  const txs = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.type] - ORDER[b.type]);
  const lots = new Map<string, { quantity: number; unitCost: number }[]>();
  const sales: RealizedSale[] = [];

  for (const tx of txs) {
    if (tx.type === 'dividend' || !(tx.quantity > 0)) continue;
    const queue = lots.get(tx.isin) ?? [];
    lots.set(tx.isin, queue);
    if (tx.type === 'buy') {
      queue.push({ quantity: tx.quantity, unitCost: (tx.amount + tx.fees) / tx.quantity });
      continue;
    }
    const proceeds = tx.amount - tx.fees;
    let left = tx.quantity;
    let cost = 0;
    while (left > 1e-9 && queue.length) {
      const lot = queue[0];
      const take = Math.min(left, lot.quantity);
      cost += take * lot.unitCost;
      lot.quantity -= take;
      left -= take;
      if (lot.quantity <= 1e-9) queue.shift();
    }
    // Fehlt die Kaufhistorie für einen Teil, zählt dieser Teil ohne Gewinn und ohne Verlust
    if (left > 1e-9) cost += (left / tx.quantity) * proceeds;
    sales.push({ date: tx.date, isin: tx.isin, proceeds, cost, gain: proceeds - cost });
  }

  const openCost = new Map<string, number>();
  for (const [isin, queue] of lots) {
    const cost = queue.reduce((s, lot) => s + lot.quantity * lot.unitCost, 0);
    if (cost > 0) openCost.set(isin, cost);
  }
  return { sales, openCost };
}

export interface YearResult {
  year: number;
  /** true beim laufenden Jahr: die Werte gelten nur bis heute */
  running: boolean;
  startValue: number;
  endValue: number;
  /** Käufe inkl. Gebühren */
  bought: number;
  /** Verkaufserlöse nach Gebühren */
  sold: number;
  dividends: number;
  /** Gewinn aus Verkäufen dieses Jahres gegenüber dem Einstand */
  realized: number;
  /** Wertzuwachs des Jahres: Endwert − Startwert − netto eingezahlt (Ausschüttungen zählen mit) */
  gain: number;
  /** Zeitgewichtete Rendite des Jahres; null, wenn das Depot das ganze Jahr leer war */
  twr: number | null;
  benchmarkReturn: number | null;
}

export interface YearsOverview {
  /** Neuestes Jahr zuerst */
  years: YearResult[];
  total: {
    /** Buchgewinn der Anteile, die noch im Depot liegen */
    open: number;
    realized: number;
    dividends: number;
    gain: number;
  };
}

export interface YearContribution {
  isin: string;
  /** Wertzuwachs dieses Wertpapiers im Jahr: Wertänderung minus Netto-Einzahlungen (Ausschüttungen zählen mit) */
  gain: number;
}

/**
 * Was hat das Jahr gemacht? Der Jahres-Gewinn, aufgeteilt auf die Wertpapiere.
 * Die Beiträge summieren sich (bis auf weggelassene Cent-Beträge) zum Jahres-Gewinn.
 */
export function yearContributions(data: PortfolioData, year: YearResult): YearContribution[] {
  const from = `${year.year - 1}-12-31`;
  const to = year.running ? data.asOf : `${year.year}-12-31`;
  const result: YearContribution[] = [];
  for (const { isin } of data.instruments) {
    const inYear = data.transactions.filter((t) => t.isin === isin && t.date.startsWith(`${year.year}-`) && t.date <= to);
    const start = valueAt(data.transactions, data.prices, from, isin);
    const end = valueAt(data.transactions, data.prices, to, isin);
    if (start <= 0 && end <= 0 && !inYear.length) continue;
    const netInflow = -inYear.reduce((s, t) => s + cashflow(t), 0);
    const gain = end - start - netInflow;
    if (Math.abs(gain) >= 0.5) result.push({ isin, gain });
  }
  return result.sort((a, b) => b.gain - a.gain);
}

export function analyzeYears(data: PortfolioData): YearsOverview {
  const { transactions, prices, asOf } = data;
  const { sales, openCost } = realizedSales(transactions);
  const first = transactions.reduce((d, t) => (t.date < d ? t.date : d), asOf);
  const firstYear = Number(first.slice(0, 4));
  const lastYear = Number(asOf.slice(0, 4));

  const years: YearResult[] = [];
  for (let year = firstYear; year <= lastYear; year++) {
    const from = year === firstYear ? null : `${year - 1}-12-31`;
    const to = year === lastYear ? asOf : `${year}-12-31`;
    const inYear = transactions.filter((t) => t.date.startsWith(`${year}-`) && t.date <= to);
    const startValue = from ? valueAt(transactions, prices, from) : 0;
    const endValue = valueAt(transactions, prices, to);
    const netInflow = -inYear.reduce((s, t) => s + cashflow(t), 0);
    const sum = (type: Transaction['type'], pick: (t: Transaction) => number) => inYear.filter((t) => t.type === type).reduce((s, t) => s + pick(t), 0);
    const series = startValue > 0 || inYear.length ? buildSeries({ ...data, asOf: to }, from) : [];
    const last = series[series.length - 1];
    years.push({
      year,
      running: year === lastYear,
      startValue,
      endValue,
      bought: sum('buy', (t) => t.amount + t.fees),
      sold: sum('sell', (t) => t.amount - t.fees),
      dividends: sum('dividend', (t) => t.amount),
      realized: sales.filter((s) => s.date.startsWith(`${year}-`) && s.date <= to).reduce((s, x) => s + x.gain, 0),
      gain: endValue - startValue - netInflow,
      twr: last ? last.twr : null,
      benchmarkReturn: last ? last.benchmarkReturn : null,
    });
  }

  const cost = [...openCost.values()].reduce((s, c) => s + c, 0);
  const open = valueAt(transactions, prices, asOf) - cost;
  const realized = sales.filter((s) => s.date <= asOf).reduce((s, x) => s + x.gain, 0);
  const dividends = transactions.filter((t) => t.type === 'dividend' && t.date <= asOf).reduce((s, t) => s + t.amount, 0);
  return { years: years.reverse(), total: { open, realized, dividends, gain: open + realized + dividends } };
}
