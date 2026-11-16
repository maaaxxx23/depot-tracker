// Monats-Rückblick: was im vergangenen Monat im Depot passiert ist.
// Nur eine Beobachtung aus den eigenen Daten, keine Bewertung.

import type { PortfolioData } from '../types';
import { cashflow, valueAt } from './performance';

/** So viele Tage zu Monatsbeginn zeigt die Startseite den Rückblick auf den Vormonat. */
export const REVIEW_DAYS = 7;

export interface MonthReview {
  /** Betrachteter Monat als YYYY-MM */
  month: string;
  startValue: number;
  endValue: number;
  /** Veränderung insgesamt: Endwert − Startwert */
  change: number;
  /** Netto zugeflossen: Käufe inkl. Gebühren − Verkaufserlöse − Ausschüttungen */
  invested: number;
  /** Wertentwicklung: Veränderung − netto zugeflossen */
  gain: number;
}

/** Letzter Tag des Monats (month 1–12) als ISO-Datum. */
const lastDayOf = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;

/** Rückblick nur zu Monatsbeginn, und nur, wenn es etwas zu zeigen gibt. */
export function reviewToShow(data: PortfolioData): MonthReview | null {
  if (Number(data.asOf.slice(8, 10)) > REVIEW_DAYS) return null;
  const review = reviewLastMonth(data);
  if (!review || (Math.abs(review.change) < 1 && Math.abs(review.invested) < 1)) return null;
  return review;
}

/** Rückblick auf den Monat vor `asOf`; null, wenn das Depot damals leer und ohne Bewegung war. */
export function reviewLastMonth(data: PortfolioData): MonthReview | null {
  let year = Number(data.asOf.slice(0, 4));
  let month = Number(data.asOf.slice(5, 7)) - 1;
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const start = month === 1 ? lastDayOf(year - 1, 12) : lastDayOf(year, month - 1);
  const end = lastDayOf(year, month);

  const inMonth = data.transactions.filter((t) => t.date.slice(0, 7) === key);
  const startValue = valueAt(data.transactions, data.prices, start);
  if (startValue <= 0 && !inMonth.length) return null;
  const endValue = valueAt(data.transactions, data.prices, end);
  const invested = -inMonth.reduce((s, t) => s + cashflow(t), 0);
  const change = endValue - startValue;
  return { month: key, startValue, endValue, change, invested, gain: change - invested };
}
