// „Seit deinem letzten Besuch“: nur die Kursbewegung der Anteile, die du beim letzten Besuch hattest.
// Käufe, Sparpläne und Verkäufe dazwischen zählen bewusst nicht, sonst sähe eine Einzahlung wie Gewinn aus.

import type { PortfolioData } from '../types';
import { holdingsAt, priceAt } from './performance';

export interface VisitSnapshot {
  /** Wann der Besuch endete (App in den Hintergrund) */
  at: string;
  /** Zeitpunkt der Kurse, mit denen bewertet war */
  pricedAt: string;
  holdings: Record<string, number>;
  prices: Record<string, number>;
}

export interface VisitChange {
  amount: number;
  rel: number;
  /** Ende des letzten Besuchs */
  since: string;
  /** true, wenn die aktuellen Kurse von Yahoo stammen (Schätzung) */
  estimate: boolean;
  /** Nur zur Ansicht erzeugtes Beispiel (Demo-Modus, keine echten Zahlen) */
  sample?: boolean;
}

/** Inhalt des Banners: eine Veränderung oder der Hinweis, dass es nichts Neues gibt. */
export type VisitBannerContent =
  | ({ kind: 'change' } & VisitChange)
  /** since: Ende des letzten Besuchs; null = noch nie verlassen, also noch kein Vergleich möglich */
  | { kind: 'none'; since: string | null };

/** Ab so langer Pause zählt das Öffnen als neuer Besuch. */
export const NEW_VISIT_AFTER_MS = 60 * 60 * 1000;

const pricedAtOf = (data: PortfolioData) => (data.source.kind === 'comdirect' ? data.source.pricedAt ?? data.source.fetchedAt : null);

/** Hält Bestand und Kurse fest, z. B. wenn die App in den Hintergrund geht. Nur für echte Daten. */
export function takeSnapshot(data: PortfolioData, now = new Date()): VisitSnapshot | null {
  const pricedAt = pricedAtOf(data);
  if (!pricedAt) return null;
  const holdings: Record<string, number> = {};
  const prices: Record<string, number> = {};
  for (const [isin, quantity] of holdingsAt(data.transactions, data.asOf)) {
    if (quantity <= 1e-9 || !data.prices[isin]?.length) continue;
    holdings[isin] = quantity;
    prices[isin] = priceAt(data.prices, isin, data.asOf);
  }
  return { at: now.toISOString(), pricedAt, holdings, prices };
}

/**
 * Kursbewegung seit dem letzten Besuch: dieselben Anteile, alter gegen neuen Kurs.
 * null, wenn es seitdem keine neuen Kurse gibt (z. B. Wochenende) oder nichts zu vergleichen ist.
 */
export function visitChange(base: VisitSnapshot | null, data: PortfolioData): VisitChange | null {
  const pricedAt = pricedAtOf(data);
  if (!base || !pricedAt || pricedAt <= base.pricedAt) return null;
  let before = 0;
  let after = 0;
  for (const [isin, quantity] of Object.entries(base.holdings)) {
    const old = base.prices[isin];
    if (!(quantity > 0) || !(old > 0) || !data.prices[isin]?.length) continue;
    before += quantity * old;
    after += quantity * priceAt(data.prices, isin, data.asOf);
  }
  if (before <= 0) return null;
  const amount = after - before;
  const rel = amount / before;
  // Unverändert (z. B. Kurse nur neu abgerufen, aber kein Handel): nichts anzeigen
  if (Math.abs(rel) < 0.00005) return null;
  return { amount, rel, since: base.at, estimate: data.source.kind === 'comdirect' && !!data.source.pricedAt };
}
