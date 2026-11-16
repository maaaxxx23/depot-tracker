export type TxType = 'buy' | 'sell' | 'dividend';

/** Eine Depotbewegung, so wie sie später auch aus der comdirect-API kommt. */
export interface Transaction {
  date: string; // ISO, YYYY-MM-DD
  isin: string;
  type: TxType;
  quantity: number; // Stück (bei Ausschüttungen 0)
  amount: number; // Kurswert bzw. Netto-Ausschüttung in EUR, immer positiv
  fees: number; // Gebühren in EUR
}

export interface Instrument {
  isin: string;
  /** Wertpapierkennnummer, falls die Bank sie liefert */
  wkn?: string;
  name: string;
  shortName: string;
  kind: 'ETF' | 'Aktie' | 'Sonstige';
}

export interface PricePoint {
  date: string;
  price: number;
}

export type PriceHistory = Record<string, PricePoint[]>;

/** Textbaustein; Beträge bleiben Zahlen, damit die Oberfläche sie verbergen kann. */
export type TextPart = string | { amount: number; signed?: boolean; /** grün/rot je nach Vorzeichen */ colored?: boolean };

export interface PortfolioData {
  instruments: Instrument[];
  transactions: Transaction[];
  prices: PriceHistory;
  /** Vergleichsindex; fehlt, solange es keine Kurshistorie dafür gibt */
  benchmark: { isin: string; name: string } | null;
  asOf: string;
  /** Einstandswert des heutigen Bestands je ISIN laut Bank (inkl. Kaufgebühren); nur bei echten Daten */
  costBasis?: Record<string, number>;
  /** Bisher bezahlte Steuer auf die Vorabpauschale je ISIN (Info; nicht in der Rendite, wird beim Verkauf angerechnet) */
  prepaidTax?: Record<string, number>;
  /** Woher die Daten stammen, und wann sie abgerufen wurden */
  source:
    | { kind: 'demo' }
    /** pricedAt: gesetzt, wenn der Bestand mit neueren Yahoo-Kursen bewertet ist (Schätzung) */
    | { kind: 'comdirect'; fetchedAt: string; pricedAt?: string };
}
