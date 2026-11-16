// Zielaufteilung: Wunschanteil je Position und wie weit das Depot davon abweicht.
// Nur eine Beobachtung, keine Empfehlung zum Kaufen oder Verkaufen.

import type { PositionResult } from './performance';

/** Wunschanteil je ISIN als Bruchteil (0,7 = 70 %). Leer = keine Zielaufteilung. */
export type TargetShares = Record<string, number>;

/** Ab so vielen Prozentpunkten Abweichung weist die App darauf hin. */
export const DEVIATION_LIMIT = 0.05;

export interface AllocationRow {
  isin: string;
  share: number;
  target: number;
  /** Anteil minus Wunschanteil in Prozentpunkten (0,03 = 3 %-Pkt. über Ziel) */
  deviation: number;
  /** true, wenn die Abweichung über dem Limit liegt */
  off: boolean;
}

/** Abweichung je Position, für die ein Wunschanteil festgelegt ist. */
export function analyzeAllocation(positions: PositionResult[], targets: TargetShares): Map<string, AllocationRow> {
  const rows = new Map<string, AllocationRow>();
  for (const p of positions) {
    const target = targets[p.instrument.isin];
    if (typeof target !== 'number') continue;
    const deviation = p.share - target;
    rows.set(p.instrument.isin, { isin: p.instrument.isin, share: p.share, target, deviation, off: Math.abs(deviation) > DEVIATION_LIMIT + 1e-9 });
  }
  return rows;
}

export interface PurchaseSplit {
  isin: string;
  amount: number;
}

/** Positionen mit Wunschanteil, dazu die auf Summe 1 normierten Ziele (falls eine Position weggefallen ist). */
function withTargets(positions: PositionResult[], targets: TargetShares) {
  const rows = positions.filter((p) => typeof targets[p.instrument.isin] === 'number');
  const sum = rows.reduce((s, p) => s + targets[p.instrument.isin], 0);
  if (!(sum > 0)) return null;
  return { rows, target: (p: PositionResult) => targets[p.instrument.isin] / sum };
}

/**
 * Teilt einen Zukauf-Betrag rechnerisch so auf die Positionen auf, dass das Depot danach
 * möglichst nah an der Zielaufteilung liegt – ohne Verkäufe: Positionen unter Ziel zuerst,
 * im Verhältnis ihres Rückstands. Ganze Euro, die Summe bleibt exakt der (gerundete) Betrag.
 * Nur eine Rechnung auf Basis der eigenen Zielaufteilung, keine Empfehlung.
 */
export function splitPurchase(positions: PositionResult[], targets: TargetShares, amount: number): PurchaseSplit[] {
  const t = withTargets(positions, targets);
  const budget = Math.round(amount);
  if (!t || !(budget > 0)) return [];
  const { rows, target } = t;
  const total = rows.reduce((s, p) => s + p.value, 0) + budget;
  // Rückstand jeder Position zu ihrem Zielwert nach dem Zukauf; die Rückstände summieren
  // sich mindestens auf den Betrag, weil Positionen über Ziel nichts "zurückgeben" können
  const deficits = rows.map((p) => Math.max(0, target(p) * total - p.value));
  const deficitSum = deficits.reduce((s, d) => s + d, 0);
  const exact = rows.map((p, i) => (deficitSum > 0 ? (deficits[i] / deficitSum) * budget : target(p) * budget));

  // Auf ganze Euro runden; der Rundungsrest geht der Reihe nach an die größten Nachkommawerte
  const result = rows.map((p, i) => ({ isin: p.instrument.isin, amount: Math.floor(exact[i]), fraction: exact[i] - Math.floor(exact[i]) }));
  let rest = budget - result.reduce((s, r) => s + r.amount, 0);
  for (const r of [...result].sort((a, b) => b.fraction - a.fraction)) {
    if (rest <= 0) break;
    r.amount += 1;
    rest -= 1;
  }
  return result.filter((r) => r.amount > 0).sort((a, b) => b.amount - a.amount).map(({ isin, amount }) => ({ isin, amount }));
}

/**
 * Betrag, mit dem das Depot ohne Verkäufe wieder genau auf der Zielaufteilung läge
 * (alles unter Ziel wird aufgefüllt, bis auch die größte Position über Ziel wieder passt).
 * 0 = passt schon; null = ohne Verkäufe nicht erreichbar oder keine Zielaufteilung.
 */
export function catchUpAmount(positions: PositionResult[], targets: TargetShares): number | null {
  const t = withTargets(positions, targets);
  if (!t) return null;
  const { rows, target } = t;
  const total = rows.reduce((s, p) => s + p.value, 0);
  let needed = total;
  for (const p of rows) {
    if (p.value <= 1e-9) continue;
    // Eine Position mit Bestand, aber 0 % Ziel, lässt sich durch Zukäufe nie ausgleichen
    if (target(p) <= 0) return null;
    needed = Math.max(needed, p.value / target(p));
  }
  return needed - total;
}

/**
 * Heutige Aufteilung als Vorschlag in ganzen Prozent, die zusammen genau 100 ergeben.
 * Der Rundungsrest geht an die größte Position.
 */
export function currentAsTargets(positions: PositionResult[]): Record<string, number> {
  const percents: Record<string, number> = {};
  if (!positions.length) return percents;
  for (const p of positions) percents[p.instrument.isin] = Math.round(p.share * 100);
  const rest = 100 - Object.values(percents).reduce((s, n) => s + n, 0);
  const largest = positions.reduce((a, b) => (b.share > a.share ? b : a)).instrument.isin;
  percents[largest] += rest;
  return percents;
}
