// Sparplan-Erkennung und Hochrechnung bis zu einem Wunschbetrag.
// Beides sind Beobachtungen bzw. grobe Schätzungen, keine Zusagen.

import type { PortfolioData } from '../types';

export interface SavingsPlan {
  isin: string;
  /** Rate pro Monat inkl. Gebühren */
  rate: number;
  /** auto = an regelmäßigen Käufen erkannt; manual = von dir markiert, Rate = letzter Kauf */
  source: 'auto' | 'manual';
  /** Tag des letzten Kaufs */
  lastBuy: string;
}

/** Von dir als Sparplan markiert, aber zuletzt nicht mehr gekauft: zählt nicht zur Sparrate. */
export interface InactivePlan {
  isin: string;
  /** null = noch nie gekauft */
  lastBuy: string | null;
}

export interface Savings {
  /** Größte Rate zuerst */
  plans: SavingsPlan[];
  inactive: InactivePlan[];
  monthlyRate: number;
  /** Alle Käufe des laufenden Jahres inkl. Gebühren */
  investedThisYear: number;
}

/** So viele Monate werden betrachtet; in mindestens MIN_MONTHS davon muss ein passender Kauf liegen. */
const WINDOW_MONTHS = 4;
const MIN_MONTHS = 3;
/** Käufe gelten als „dieselbe Rate“, wenn sie höchstens so weit vom typischen Betrag abweichen. */
const TOLERANCE = 0.25;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Monat `back` Monate vor dem Monat von `iso`, als YYYY-MM. */
function monthBefore(iso: string, back: number): string {
  const index = Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1 - back;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/**
 * Regelmäßige Käufe je Wertpapier: ähnlich hohe Beträge in mindestens drei der letzten vier Monate.
 * Steht der Kauf im laufenden Monat noch aus, zählen die vier Monate davor.
 *
 * @param marked ISINs, die du selbst als Sparplan markiert hast. Sie zählen sofort mit der Höhe
 *   des letzten Kaufs, solange im laufenden oder im letzten Monat gekauft wurde.
 */
export function detectSavings(data: PortfolioData, marked: string[] = []): Savings {
  const { asOf } = data;
  const buys = data.transactions.filter((t) => t.type === 'buy' && t.date <= asOf);
  const current = asOf.slice(0, 7);
  const earliest = monthBefore(asOf, WINDOW_MONTHS);

  const plans: SavingsPlan[] = [];
  for (const isin of new Set(buys.map((t) => t.isin))) {
    const recent = buys.filter((t) => t.isin === isin && t.date.slice(0, 7) >= earliest);
    if (recent.length < MIN_MONTHS) continue;
    const typical = median(recent.map((t) => t.amount + t.fees));
    if (!(typical > 0)) continue;
    // Summe der passenden Käufe je Monat (ein Sparplan kann mehrmals im Monat ausführen)
    const perMonth = new Map<string, number>();
    for (const t of recent) {
      const amount = t.amount + t.fees;
      if (Math.abs(amount - typical) > typical * TOLERANCE) continue;
      const month = t.date.slice(0, 7);
      perMonth.set(month, (perMonth.get(month) ?? 0) + amount);
    }
    const offset = perMonth.has(current) ? 0 : 1;
    const due = Array.from({ length: WINDOW_MONTHS }, (_, k) => monthBefore(asOf, k + offset));
    const hits = due.filter((m) => perMonth.has(m));
    if (hits.length < MIN_MONTHS) continue;
    plans.push({ isin, rate: median(hits.map((m) => perMonth.get(m)!)), source: 'auto', lastBuy: recent.reduce((d, t) => (t.date > d ? t.date : d), '') });
  }

  const inactive: InactivePlan[] = [];
  const lastMonth = monthBefore(asOf, 1);
  for (const isin of marked) {
    if (plans.some((p) => p.isin === isin)) continue;
    const own = buys.filter((t) => t.isin === isin);
    const lastBuy = own.reduce<string | null>((d, t) => (d === null || t.date > d ? t.date : d), null);
    if (lastBuy === null || lastBuy.slice(0, 7) < lastMonth) {
      inactive.push({ isin, lastBuy });
      continue;
    }
    const rate = own.filter((t) => t.date === lastBuy).reduce((s, t) => s + t.amount + t.fees, 0);
    plans.push({ isin, rate, source: 'manual', lastBuy });
  }
  plans.sort((a, b) => b.rate - a.rate);

  const year = asOf.slice(0, 4);
  return {
    plans,
    inactive,
    monthlyRate: plans.reduce((s, p) => s + p.rate, 0),
    investedThisYear: buys.filter((t) => t.date.startsWith(year)).reduce((s, t) => s + t.amount + t.fees, 0),
  };
}

/** Sparplan-Status eines einzelnen Wertpapiers, für die Positionsdetails. */
export type PlanStatus =
  | { kind: 'none' }
  | { kind: 'auto' | 'manual'; rate: number; lastBuy: string }
  | { kind: 'inactive'; lastBuy: string | null };

export function planStatus(savings: Savings, isin: string): PlanStatus {
  const plan = savings.plans.find((p) => p.isin === isin);
  if (plan) return { kind: plan.source, rate: plan.rate, lastBuy: plan.lastBuy };
  const idle = savings.inactive.find((p) => p.isin === isin);
  return idle ? { kind: 'inactive', lastBuy: idle.lastBuy } : { kind: 'none' };
}

/** Vorgabe für die angenommene Rendite pro Jahr in der Hochrechnung: bewusst vorsichtig. Einstellbar. */
export const DEFAULT_RETURN = 0.05;
export const MAX_RETURN = 0.12;
export const RETURN_STEP = 0.005;
const MAX_MONTHS = 50 * 12;

/**
 * Monate, bis `value` bei monatlicher Rate und jährlicher Rendite `goal` erreicht.
 * 0 = schon erreicht, null = nicht innerhalb von 50 Jahren.
 */
export function monthsToGoal(value: number, goal: number, monthlyRate: number, annualReturn: number): number | null {
  if (value >= goal) return 0;
  const growth = Math.pow(1 + annualReturn, 1 / 12);
  let v = value;
  for (let month = 1; month <= MAX_MONTHS; month++) {
    v = v * growth + monthlyRate;
    if (v >= goal) return month;
  }
  return null;
}

export interface GoalProjection {
  /** Anteil des Ziels, der erreicht ist (höchstens 1) */
  progress: number;
  remaining: number;
  /** Rendite pro Jahr, mit der gerechnet wurde */
  annualReturn: number;
  /** Erwarteter Monat (YYYY-MM) mit angenommener Rendite; null = nicht absehbar */
  withReturn: string | null;
  /** Erwarteter Monat nur durch Einzahlungen, ohne Kursgewinne; null = ohne Sparrate nicht erreichbar */
  withoutReturn: string | null;
}

/** Länge des Korridor-Diagramms: höchstens 25 Jahre. */
export const CORRIDOR_MAX_MONTHS = 300;

/**
 * Monatliche Verlaufspunkte der Hochrechnung. Die Linie endet, sobald sie den
 * Wunschbetrag erreicht – so zeigt ihr Endpunkt im Diagramm den Ankunftszeitpunkt,
 * statt als flache Punktreihe weiterzulaufen.
 */
export function projectSeries(value: number, goal: number, monthlyRate: number, annualReturn: number, months: number): number[] {
  const growth = Math.pow(1 + annualReturn, 1 / 12);
  const points = [Math.min(value, goal)];
  let v = value;
  for (let m = 1; m <= months && points[points.length - 1] < goal; m++) {
    v = v * growth + monthlyRate;
    points.push(Math.min(v, goal));
  }
  return points;
}

/** Zeitraum des Korridor-Diagramms: bis auch die langsamste Linie ankommt, begrenzt auf 1 bis 25 Jahre. */
export function corridorMonths(value: number, goal: number, monthlyRate: number, rates: number[]): number {
  let longest: number | null = null;
  for (const rate of rates) {
    const months = monthsToGoal(value, goal, monthlyRate, rate);
    if (months !== null) longest = Math.max(longest ?? 0, months);
  }
  return Math.max(12, Math.min(CORRIDOR_MAX_MONTHS, longest ?? CORRIDOR_MAX_MONTHS));
}

/**
 * Durchschnittliche Rendite pro Jahr einer Kursreihe (geometrisch, von erstem bis letztem Punkt).
 * null bei weniger als drei Jahren Historie – ein kürzerer Zeitraum wäre kein „Durchschnitt“.
 */
export function averageAnnualReturn(points: { date: string; price: number }[]): number | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const years = (Date.parse(last.date) - Date.parse(first.date)) / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 3 || first.price <= 0 || last.price <= 0) return null;
  return Math.pow(last.price / first.price, 1 / years) - 1;
}

export function projectGoal(value: number, goal: number, monthlyRate: number, asOf: string, annualReturn = DEFAULT_RETURN): GoalProjection {
  const month = (n: number | null) => (n === null ? null : monthBefore(asOf, -n));
  return {
    progress: goal > 0 ? Math.min(1, Math.max(0, value / goal)) : 0,
    remaining: Math.max(0, goal - value),
    annualReturn,
    withReturn: month(monthsToGoal(value, goal, monthlyRate, annualReturn)),
    withoutReturn: month(monthsToGoal(value, goal, monthlyRate, 0)),
  };
}
