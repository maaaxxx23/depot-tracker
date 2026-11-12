// Überschneidung zwischen ETFs: Wie viel von zwei ETFs steckt in denselben Firmen?
// Gerechnet wird je Firma der kleinere der beiden Anteile; die Summe ist der Teil, den beide ETFs gemeinsam haben.
// Eine Beobachtung, keine Empfehlung: Ob eine Überschneidung stört, hängt von deinen Zielen ab.

import type { FundComposition } from '../data/holdingsImport';
import { companyKey, displayName } from './composition';
import type { PositionResult } from './performance';

export type OverlapLevel = 'high' | 'medium' | 'low';

/** Ab diesen Werten gilt eine Überschneidung als hoch bzw. mittel. */
export const HIGH_OVERLAP = 0.5;
export const MEDIUM_OVERLAP = 0.2;

export interface OverlapPair {
  a: PositionResult;
  b: PositionResult;
  /** Gemeinsamer Anteil (0,6 = 60 % beider ETFs stecken in denselben Firmen mit demselben Gewicht) */
  overlap: number;
  level: OverlapLevel;
  /** Anzahl gemeinsamer Firmen in den ausgewerteten Listen */
  common: number;
  /** Die gemeinsamen Firmen mit dem größten gemeinsamen Gewicht */
  examples: string[];
  /** Anteil jedes ETF, den die gespeicherte Liste abdeckt; unter 1 ist die Überschneidung eine Untergrenze */
  coverageA: number;
  coverageB: number;
}

export interface OverlapResult {
  /** Stärkste Überschneidung zuerst */
  pairs: OverlapPair[];
  /** Anteil des Depots in Firmen, die über mindestens zwei deiner ETFs gehalten werden */
  duplicated: number;
  /** Anzahl dieser Firmen */
  duplicatedCount: number;
}

/** Gewicht je Firma in einem ETF, Schreibweisen zusammengeführt. */
function weights(fund: FundComposition): Map<string, { weight: number; name: string }> {
  const map = new Map<string, { weight: number; name: string }>();
  for (const h of fund.top) {
    const key = companyKey(h.name);
    if (!key) continue;
    const entry = map.get(key) ?? { weight: 0, name: displayName(h.name).replace(/\s+Class\s+[A-Z]$/i, '') };
    entry.weight += h.weight;
    map.set(key, entry);
  }
  return map;
}

const levelOf = (overlap: number): OverlapLevel => (overlap >= HIGH_OVERLAP ? 'high' : overlap >= MEDIUM_OVERLAP ? 'medium' : 'low');

export function analyzeOverlap(positions: PositionResult[], compositions: Record<string, FundComposition>): OverlapResult {
  const funds = positions.filter((p) => compositions[p.instrument.isin]).map((p) => ({ p, map: weights(compositions[p.instrument.isin]) }));
  const coverage = (map: Map<string, { weight: number }>) => Math.min(1, [...map.values()].reduce((s, e) => s + e.weight, 0));

  const pairs: OverlapPair[] = [];
  for (let i = 0; i < funds.length; i++) {
    for (let j = i + 1; j < funds.length; j++) {
      const shared: { name: string; weight: number }[] = [];
      for (const [key, a] of funds[i].map) {
        const b = funds[j].map.get(key);
        if (b) shared.push({ name: a.name, weight: Math.min(a.weight, b.weight) });
      }
      shared.sort((x, y) => y.weight - x.weight);
      const overlap = shared.reduce((s, x) => s + x.weight, 0);
      pairs.push({
        a: funds[i].p,
        b: funds[j].p,
        overlap,
        level: levelOf(overlap),
        common: shared.length,
        examples: shared.slice(0, 4).map((x) => x.name),
        coverageA: coverage(funds[i].map),
        coverageB: coverage(funds[j].map),
      });
    }
  }
  pairs.sort((x, y) => y.overlap - x.overlap);

  // Firmen, die über mehrere ETFs im Depot liegen: ihr gesamtes Gewicht im Depot
  const perCompany = new Map<string, { weight: number; sources: number }>();
  for (const { p, map } of funds) {
    for (const [key, entry] of map) {
      const total = perCompany.get(key) ?? { weight: 0, sources: 0 };
      total.weight += entry.weight * p.share;
      total.sources++;
      perCompany.set(key, total);
    }
  }
  const multiple = [...perCompany.values()].filter((c) => c.sources > 1);
  return { pairs, duplicated: multiple.reduce((s, c) => s + c.weight, 0), duplicatedCount: multiple.length };
}
