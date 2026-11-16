import { PortfolioData, TextPart } from '../types';
import { monthYear, percent, points, shortPercent } from '../ui/format';
import type { AllocationRow } from './allocation';
import { estimateVorabpauschale, pauschaleYear } from './vorabpauschale';
import { holdingsAt, PositionResult, priceAt, priceDates, valueAt } from './performance';

// Regelbasierte Hinweise: nur Beobachtungen, keine Empfehlungen.

export type InsightTone = 'warn' | 'info' | 'good';

export interface Insight {
  id: string;
  tone: InsightTone;
  parts: TextPart[];
}

const CONCENTRATION_LIMIT = 0.1;
const DRAWDOWN_LIMIT = 0.05;
const FEE_RATIO_LIMIT = 0.01;
const MILESTONE_DISTANCE = 0.05;
const MIN_STREAK = 6;
const VORAB_MIN = 5;
const MAX_INSIGHTS = 3;

const minusOneYear = (iso: string) => `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`;

/** Einzelaktien über dem Anteilslimit. */
export function concentration(positions: PositionResult[]): PositionResult[] {
  return positions.filter((p) => p.instrument.kind === 'Aktie' && p.share > CONCENTRATION_LIMIT);
}

/**
 * Wie weit der heutige Bestand unter seinem Höchstwert der letzten 12 Monate liegt.
 * Bewertet wird immer dieselbe Stückzahl, damit Einzahlungen das Bild nicht verzerren.
 */
export function drawdownOfCurrentHoldings(data: PortfolioData) {
  const holdings = holdingsAt(data.transactions, data.asOf);
  const valueOn = (date: string) => {
    let value = 0;
    for (const [isin, quantity] of holdings) if (quantity > 1e-9) value += quantity * priceAt(data.prices, isin, date);
    return value;
  };
  const since = minusOneYear(data.asOf);
  const dates = priceDates(data.prices).filter((d) => d >= since && d <= data.asOf);
  const current = valueOn(data.asOf);
  let peak = current;
  let peakDate = data.asOf;
  for (const date of dates) {
    const value = valueOn(date);
    if (value > peak) {
      peak = value;
      peakDate = date;
    }
  }
  return { peak, peakDate, current, amount: peak - current, drop: peak > 0 ? (peak - current) / peak : 0 };
}

export function feesThisYear(data: PortfolioData) {
  const year = data.asOf.slice(0, 4);
  const txs = data.transactions.filter((t) => t.date.startsWith(year) && t.date <= data.asOf);
  const fees = txs.reduce((s, t) => s + t.fees, 0);
  const bought = txs.filter((t) => t.type === 'buy').reduce((s, t) => s + t.amount + t.fees, 0);
  return { year, fees, ratio: bought > 0 ? fees / bought : 0 };
}

/** Nächste runde Marke: 10.000er-Schritte bis 100.000 €, danach 25.000er. */
export function nextMilestone(value: number) {
  const step = value < 100_000 ? 10_000 : 25_000;
  const next = Math.floor(value / step) * step + step;
  return { next, remaining: next - value };
}

/** Anzahl aufeinanderfolgender Monate mit mindestens einem Kauf, bis heute. */
export function savingsStreak(data: PortfolioData): number {
  const months = new Set(data.transactions.filter((t) => t.type === 'buy' && t.date <= data.asOf).map((t) => t.date.slice(0, 7)));
  let [y, m] = data.asOf.split('-').map(Number);
  const key = () => `${y}-${String(m).padStart(2, '0')}`;
  const back = () => {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  };
  // Im laufenden Monat darf der Kauf noch ausstehen
  if (!months.has(key())) back();
  let streak = 0;
  while (months.has(key())) {
    streak++;
    back();
  }
  return streak;
}

/**
 * @param hasGoal mit eigenem Wunschbetrag entfällt der Hinweis auf die nächste runde Marke
 * @param allocation Abweichungen von der Zielaufteilung; deutliche werden als Hinweis gezeigt
 */
export function buildInsights(data: PortfolioData, positions: PositionResult[], hasGoal = false, allocation?: Map<string, AllocationRow>): Insight[] {
  const insights: Insight[] = [];

  const dd = drawdownOfCurrentHoldings(data);
  if (dd.drop > DRAWDOWN_LIMIT) {
    insights.push({
      id: 'drawdown',
      tone: 'warn',
      parts: [`Dein heutiger Bestand war ${monthYear(dd.peakDate)}`, { amount: dd.amount }, `mehr wert (−${percent(dd.drop)}).`],
    });
  }

  for (const p of concentration(positions)) {
    insights.push({ id: `concentration-${p.instrument.isin}`, tone: 'warn', parts: [`${p.instrument.shortName} macht ${percent(p.share)} deines Depots aus.`] });
  }

  for (const p of positions) {
    const row = allocation?.get(p.instrument.isin);
    if (!row?.off) continue;
    insights.push({
      id: `allocation-${row.isin}`,
      tone: 'info',
      parts: [`${p.instrument.shortName} liegt ${points(row.deviation)} ${row.deviation > 0 ? 'über' : 'unter'} deinem Wunschanteil von ${shortPercent(row.target)}.`],
    });
  }

  // Vorabpauschale: erst kurz vor der Abbuchung erinnern (Dezember und Januar), sonst nur in der Jahresübersicht
  const month = Number(data.asOf.slice(5, 7));
  if (month === 12 || month === 1) {
    const year = pauschaleYear(data.asOf);
    const vorab = estimateVorabpauschale(data, year);
    if (vorab && vorab.tax >= VORAB_MIN) {
      insights.push({
        id: 'vorabpauschale',
        tone: 'info',
        parts: [`Vorabpauschale für ${year}: comdirect bucht Anfang Januar ${year + 1} voraussichtlich`, { amount: vorab.tax }, 'Steuer ab.'],
      });
    }
  }

  const fees = feesThisYear(data);
  if (fees.ratio > FEE_RATIO_LIMIT) {
    insights.push({ id: 'fees', tone: 'info', parts: [`Gebühren ${fees.year}:`, { amount: fees.fees }, `, das sind ${percent(fees.ratio)} deiner Käufe.`] });
  }

  const value = valueAt(data.transactions, data.prices, data.asOf);
  const milestone = nextMilestone(value);
  if (!hasGoal && value > 0 && milestone.remaining / milestone.next < MILESTONE_DISTANCE) {
    insights.push({ id: 'milestone', tone: 'good', parts: ['Noch', { amount: milestone.remaining }, 'bis', { amount: milestone.next }, '.'] });
  }

  const streak = savingsStreak(data);
  if (streak >= MIN_STREAK) {
    insights.push({ id: 'streak', tone: 'good', parts: [`Seit ${streak} Monaten jeden Monat investiert.`] });
  }

  return insights.slice(0, MAX_INSIGHTS);
}
