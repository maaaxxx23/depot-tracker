// „Top-Bewegungen“: Welche der größten Firmen bewegen das Depot heute wie stark?
// Beitrag = Gewicht der Firma im Depot × ihre Tagesbewegung — eine Näherung, keine exakte Zerlegung.

import type { MoverCache } from '../market/movers';
import { MAX_MOVERS } from '../market/movers';
import type { CompanySlice } from './composition';

export interface MoverRow {
  key: string;
  label: string;
  /** Tagesbewegung der Aktie als Bruchteil */
  change: number;
  /** Rechnerischer Beitrag zum Depot in Bruchteilen (Gewicht × Bewegung) */
  contribution: number;
}

export interface MoversResult {
  /** Nach Größe des Beitrags sortiert */
  rows: MoverRow[];
  /** Summe der Beiträge */
  totalContribution: number;
  /** Anteil des Depots, den diese Firmen zusammen ausmachen */
  totalWeight: number;
  /** Jüngster Handelstag unter den Kursen; null ohne Zeilen */
  date: string | null;
}

export function computeMovers(companies: CompanySlice[], cache: MoverCache | null): MoversResult {
  const rows: MoverRow[] = [];
  let totalWeight = 0;
  let date: string | null = null;
  for (const c of companies.slice(0, MAX_MOVERS)) {
    const quote = cache?.quotes[c.key];
    if (!quote) continue;
    rows.push({ key: c.key, label: c.label, change: quote.change, contribution: c.weight * quote.change });
    totalWeight += c.weight;
    if (!date || quote.date > date) date = quote.date;
  }
  rows.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return { rows, totalContribution: rows.reduce((s, r) => s + r.contribution, 0), totalWeight, date };
}
