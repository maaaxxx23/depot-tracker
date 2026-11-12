// Vorschau auf die Vorabpauschale: die Steuer, die comdirect Anfang Januar für thesaurierte
// Erträge des Vorjahres abbucht (§ 18 InvStG). Eine Schätzung, keine Steuerberechnung:
// ohne Kirchensteuer, ohne Verrechnung mit Freistellungsauftrag oder Verlusten.

import type { PortfolioData, Transaction } from '../types';
import { priceAt } from './performance';

/** Basiszins laut BMF je Jahr; negativ → Vorabpauschale 0. Jedes Jahr Anfang Januar ergänzen. */
export const BASISZINS: Record<number, number> = {
  2021: -0.0045,
  2022: -0.0005,
  2023: 0.0255,
  2024: 0.0229,
  2025: 0.0253,
  2026: 0.032,
};

/** Aktienfonds (mindestens 51 % Aktien): 30 % der Erträge sind steuerfrei. Angenommen für alle ETFs. */
export const TEILFREISTELLUNG = 0.3;
/** Abgeltungsteuer inkl. Solidaritätszuschlag, ohne Kirchensteuer. */
export const ABGELTUNGSTEUER = 0.25 * 1.055;

export interface PauschaleItem {
  isin: string;
  /** Vorabpauschale (steuerlicher Ertrag) in EUR */
  pauschale: number;
  /** Geschätzte Steuer darauf */
  tax: number;
}

export interface PauschaleEstimate {
  year: number;
  zins: number;
  /** true, wenn das Jahr noch läuft: der Jahresendkurs ist mit heutigen Kursen geschätzt */
  running: boolean;
  items: PauschaleItem[];
  total: number;
  tax: number;
}

/** Käufe vor Verkäufen desselben Tages, wie in years.ts. */
const ORDER = { buy: 0, dividend: 1, sell: 2 } as const;

/** Bestand am Jahresende als FIFO-Posten mit Kaufdatum (für die Zwölftelung im Kaufjahr). */
function lotsAt(txs: Transaction[], isin: string, end: string): { quantity: number; date: string }[] {
  const lots: { quantity: number; date: string }[] = [];
  const own = txs
    .filter((t) => t.isin === isin && t.date <= end && t.type !== 'dividend')
    .sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.type] - ORDER[b.type]);
  for (const tx of own) {
    if (!(tx.quantity > 0)) continue;
    if (tx.type === 'buy') {
      lots.push({ quantity: tx.quantity, date: tx.date });
      continue;
    }
    let left = tx.quantity;
    while (left > 1e-9 && lots.length) {
      const take = Math.min(left, lots[0].quantity);
      lots[0].quantity -= take;
      left -= take;
      if (lots[0].quantity <= 1e-9) lots.shift();
    }
  }
  return lots;
}

/** Im Kaufjahr zählt die Vorabpauschale nur anteilig: ein Zwölftel weniger je vollem Monat vor dem Kauf. */
const monthFactor = (lotDate: string, year: number) => (lotDate >= `${year}-01-01` ? (13 - Number(lotDate.slice(5, 7))) / 12 : 1);

/**
 * Schätzt die Vorabpauschale des Jahres für alle ETFs im Depot.
 * null, wenn für das Jahr (noch) kein Basiszins hinterlegt ist.
 */
export function estimateVorabpauschale(data: PortfolioData, year: number): PauschaleEstimate | null {
  const zins = BASISZINS[year];
  if (zins === undefined) return null;
  const yearEnd = `${year}-12-31`;
  const running = data.asOf < yearEnd;
  const end = running ? data.asOf : yearEnd;

  const items: PauschaleItem[] = [];
  if (zins > 0) {
    for (const instrument of data.instruments) {
      // Nur Fonds: für Einzelaktien gibt es keine Vorabpauschale
      if (instrument.kind !== 'ETF') continue;
      try {
        const lots = lotsAt(data.transactions, instrument.isin, end);
        const shares = lots.reduce((s, lot) => s + lot.quantity, 0);
        if (shares <= 1e-9) continue;
        const startPrice = priceAt(data.prices, instrument.isin, `${year - 1}-12-31`);
        const endPrice = priceAt(data.prices, instrument.isin, end);
        const dividends = data.transactions
          .filter((t) => t.isin === instrument.isin && t.type === 'dividend' && t.date.startsWith(`${year}-`) && t.date <= end)
          .reduce((s, t) => s + t.amount, 0);
        const divPerShare = dividends / shares;
        // Basisertrag je Anteil, gedeckelt auf den Wertzuwachs des Jahres (inkl. Ausschüttungen)
        const basisPerShare = Math.max(0, Math.min(0.7 * zins * startPrice, endPrice - startPrice + divPerShare));
        const perShare = Math.max(0, basisPerShare - divPerShare);
        if (perShare <= 0) continue;
        const pauschale = perShare * lots.reduce((s, lot) => s + lot.quantity * monthFactor(lot.date, year), 0);
        if (pauschale <= 0) continue;
        items.push({ isin: instrument.isin, pauschale, tax: pauschale * (1 - TEILFREISTELLUNG) * ABGELTUNGSTEUER });
      } catch {
        // Ohne Kurse keine Schätzung für dieses Papier
      }
    }
  }
  items.sort((a, b) => b.tax - a.tax);
  return {
    year,
    zins,
    running,
    items,
    total: items.reduce((s, i) => s + i.pauschale, 0),
    tax: items.reduce((s, i) => s + i.tax, 0),
  };
}

/** Das Jahr, dessen Vorabpauschale gerade interessiert: im Januar das Vorjahr (Abbuchung läuft), sonst das laufende. */
export function pauschaleYear(asOf: string): number {
  const year = Number(asOf.slice(0, 4));
  return Number(asOf.slice(5, 7)) === 1 ? year - 1 : year;
}
