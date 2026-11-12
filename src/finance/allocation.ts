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
