// Import aus den CSV-Exporten von comdirect.de (rein, ohne Geräte-Zugriff, damit testbar):
// Depotumsätze (Käufe/Verkäufe) und Umsätze des Verrechnungskontos (daraus nur Ausschüttungen/Dividenden).
// Format (Stand 11/2026): Windows-1252, Semikolon, Werte in Anführungszeichen, deutsche Zahlen,
// ein paar Kopfzeilen, dann
// "Buchungstag";"Geschäftstag";"Stück / Nom.";"Bezeichnung";"WKN";"Währung";"Ausführungskurs";"Umsatz in EUR";

import { dedupeCsvAgainstBank, RawTransaction } from '../comdirect/portfolio';
import type { StoredPortfolio } from './backupFormat';

// --- Zeichensatz ---

const CP1252: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š',
  0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};

/** Strenges UTF-8; null, sobald eine Bytefolge nicht passt. */
function utf8(bytes: Uint8Array): string | null {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    const len = b < 0x80 ? 1 : b >= 0xc2 && b < 0xe0 ? 2 : b >= 0xe0 && b < 0xf0 ? 3 : b >= 0xf0 && b < 0xf5 ? 4 : 0;
    if (!len || i + len > bytes.length) return null;
    let code = len === 1 ? b : b & (0xff >> (len + 1));
    for (let k = 1; k < len; k++) {
      const c = bytes[i + k];
      if ((c & 0xc0) !== 0x80) return null;
      code = (code << 6) | (c & 0x3f);
    }
    out += String.fromCodePoint(code);
    i += len;
  }
  return out;
}

/** comdirect liefert Windows-1252; falls die Datei unterwegs zu UTF-8 wurde, geht auch das. */
export function decodeCsv(bytes: Uint8Array): string {
  const text = utf8(bytes);
  if (text !== null) return text.replace(/^﻿/, '');
  let out = '';
  for (const b of bytes) out += CP1252[b] ?? String.fromCharCode(b);
  return out;
}

// --- Parsen ---

function splitRow(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ';') {
      cells.push(cell);
      cell = '';
    } else cell += ch;
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

/** Spaltenname ohne Umlaute, Leer- und Sonderzeichen; so stören auch kaputte Umlaute nicht. */
const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

const COLUMNS = {
  bookingDate: 'buchungstag',
  businessDate: 'geschftstag',
  quantity: 'stcknom',
  name: 'bezeichnung',
  wkn: 'wkn',
  currency: 'whrung',
  price: 'ausfhrungskurs',
  value: 'umsatzineur',
} as const;
const REQUIRED: (keyof typeof COLUMNS)[] = ['bookingDate', 'quantity', 'wkn', 'value'];

/** „1.234,56“ → 1234.56; ohne Komma ist „-12.50“ ein Dezimalpunkt, „1.000“ ein Tausenderpunkt. */
export function germanNumber(s: string): number {
  let t = s.replace(/\s/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  return t === '' || t === '-' ? NaN : Number(t);
}

/** „03.11.2026“ → „2026-11-03“ */
function isoDate(s: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export interface CsvResult {
  kind: 'depot';
  transactions: RawTransaction[];
  buys: number;
  sells: number;
  from: string | null;
  to: string | null;
  /** Zeilen, die nach Umsätzen aussahen, aber nicht lesbar waren */
  skipped: number;
}

export function parseDepotCsv(text: string): CsvResult {
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex((l) => {
    const cells = splitRow(l).map(key);
    return cells.includes(COLUMNS.bookingDate) && cells.includes(COLUMNS.value);
  });
  if (headerIndex < 0) {
    throw new Error('Das ist kein Export der Depotumsätze von comdirect (Spalte „Buchungstag“ oder „Umsatz in EUR“ fehlt). Exportiere auf comdirect.de unter Depot → Depotumsätze → „Export als csv“.');
  }
  const header = splitRow(lines[headerIndex]).map(key);
  const col = {} as Record<keyof typeof COLUMNS, number>;
  for (const [name, label] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, string][]) col[name] = header.indexOf(label);
  const missing = REQUIRED.filter((c) => col[c] < 0);
  if (missing.length) throw new Error(`In der Datei fehlen Spalten: ${missing.map((c) => COLUMNS[c]).join(', ')}`);

  const transactions: RawTransaction[] = [];
  const seen = new Map<string, number>();
  let skipped = 0;
  let buys = 0;
  let sells = 0;
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim()) continue;
    const cells = splitRow(line);
    const cell = (c: keyof typeof COLUMNS) => (col[c] >= 0 ? cells[col[c]] ?? '' : '');
    const bookingDate = isoDate(cell('bookingDate'));
    if (!bookingDate) {
      // Fußzeilen o. Ä. ohne Datum ignorieren; nur echte Umsatzzeilen zählen als übersprungen
      if (/^\d/.test(cell('bookingDate'))) skipped++;
      continue;
    }
    const quantity = germanNumber(cell('quantity'));
    const value = germanNumber(cell('value'));
    const wkn = cell('wkn').toUpperCase();
    if (!isFinite(quantity) || quantity === 0 || !isFinite(value) || !wkn) {
      skipped++;
      continue;
    }
    // Keine Spalte für die Art: negative Stück oder negativer Umsatz bedeuten Verkauf
    const sell = quantity < 0 || value < 0;
    const price = germanNumber(cell('price'));
    const currency = cell('currency').toUpperCase();
    const qty = Math.abs(quantity);
    const amount = Math.abs(value);
    // Stabile Kennung, damit ein erneuter Import derselben Datei nichts doppelt anlegt
    const base = `${bookingDate}|${wkn}|${qty}|${amount}|${sell ? 'S' : 'B'}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    transactions.push({
      transactionId: `csv:${base}|${n}`,
      source: 'csv',
      bookingStatus: 'BOOKED',
      bookingDate,
      businessDate: isoDate(cell('businessDate')) ?? bookingDate,
      quantity: { value: String(qty) },
      instrument: { wkn, name: cell('name') || wkn },
      // Kurs nur in Euro übernehmen; sonst ergibt er sich aus dem Euro-Umsatz
      executionPrice: (currency === '' || currency === 'EUR') && price > 0 ? { value: String(price), unit: 'EUR' } : undefined,
      transactionValue: { value: String(amount), unit: 'EUR' },
      transactionType: { key: sell ? 'SELL' : 'BUY' },
    });
    if (sell) sells++;
    else buys++;
  }
  const dates = transactions.map((t) => t.bookingDate!).sort();
  return { kind: 'depot', transactions, buys, sells, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null, skipped };
}

/**
 * Fügt importierte Umsätze zum gespeicherten Stand hinzu. Umsätze, die comdirect schon über die
 * Schnittstelle geliefert hat, gelten als dieselben und werden nicht doppelt gezählt.
 */
export function addCsvTransactions(stored: StoredPortfolio, imported: RawTransaction[]): { stored: StoredPortfolio; added: number } {
  const existingIds = new Set(stored.raw.transactions.map((t) => t.transactionId).filter(Boolean));
  const combined = [...stored.raw.transactions, ...imported.filter((t) => !existingIds.has(t.transactionId))];
  const transactions = dedupeCsvAgainstBank(combined);
  return { stored: { ...stored, raw: { ...stored.raw, transactions } }, added: transactions.length - stored.raw.transactions.length };
}

// --- Umsätze des Verrechnungskontos: Ausschüttungen und Dividenden ---
// "Buchungstag";"Wertstellung (Valuta)";"Vorgang";"Buchungstext";"Umsatz in EUR";
// Beispiel (Vorgang „Kupon“): "ERTRAEGNISGUTSCHRIFT VOM 15.09.26 DEPOTBESTAND: 1,234 ISH.STOX.EUROPE 600 U.ETF A0F5UH EUR 0,1234 ..."

export interface AccountCsvResult {
  kind: 'account';
  /** Ausschüttungen (Art DIVIDEND, netto nach Steuern) und Vorabpauschale (Art PREPAID_TAX) */
  transactions: RawTransaction[];
  dividends: number;
  /** Summe der Ausschüttungen */
  total: number;
  /** Anzahl und Summe der Steuer auf die Vorabpauschale */
  prepaidTaxes: number;
  prepaidTaxTotal: number;
  from: string | null;
  to: string | null;
  /** Ausschüttungen, deren Wertpapier sich nicht bestimmen ließ (werden nicht übernommen) */
  unassigned: number;
}

export type ImportResult = CsvResult | AccountCsvResult;

const ACCOUNT_COLUMNS = { bookingDate: 'buchungstag', valuta: 'wertstellungvaluta', kind: 'vorgang', text: 'buchungstext', value: 'umsatzineur' } as const;

const DISTRIBUTION_KIND = /kupon|dividende|ertrag|aussch/i;
const DISTRIBUTION_TEXT = /ERTRAEGNISGUTSCHRIFT|ERTRAGSGUTSCHRIFT|DIVIDENDENGUTSCHRIFT|AUSSCHUETTUNG|AUSSCHÜTTUNG|DIVIDENDE/i;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
// Steuer auf die Vorabpauschale (thesaurierende Fonds): Vorauszahlung, die beim Verkauf angerechnet wird
const PREPAID_TAX_TEXT = /VORABPAUSCHALE/i;

/** WKN oder ISIN aus dem Buchungstext: zuerst eine, die die App schon kennt, sonst die hinter dem Namen. */
export function instrumentFromText(text: string, known: Set<string>): string | null {
  const upper = text.toUpperCase();
  const tokens = upper.split(/[^A-Z0-9]+/).filter(Boolean);
  const hit = tokens.find((t) => known.has(t));
  if (hit) return hit;
  const m = /DEPOTBESTAND:?\s*[\d.,]+\s+.+?\s([A-Z]{2}[A-Z0-9]{9}\d|[A-Z0-9]{6})\s+[A-Z]{3}\s+[\d.,]+/.exec(upper);
  // Eine WKN enthält praktisch immer eine Ziffer; reine Wörter wie „EUROPE“ sind Teil des Namens
  return m && /\d/.test(m[1]) ? m[1] : null;
}

export function parseAccountCsv(text: string, known: Set<string>): AccountCsvResult {
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex((l) => {
    const cells = splitRow(l).map(key);
    return cells.includes(ACCOUNT_COLUMNS.bookingDate) && cells.includes(ACCOUNT_COLUMNS.text) && cells.includes(ACCOUNT_COLUMNS.value);
  });
  if (headerIndex < 0) throw new Error('In der Datei fehlen die Spalten „Buchungstag“, „Buchungstext“ oder „Umsatz in EUR“.');
  const header = splitRow(lines[headerIndex]).map(key);
  const col = (name: keyof typeof ACCOUNT_COLUMNS) => header.indexOf(ACCOUNT_COLUMNS[name]);

  const transactions: RawTransaction[] = [];
  const seen = new Map<string, number>();
  let unassigned = 0;
  let total = 0;
  let dividends = 0;
  let prepaidTaxes = 0;
  let prepaidTaxTotal = 0;
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim()) continue;
    const cells = splitRow(line);
    const cell = (name: keyof typeof ACCOUNT_COLUMNS) => (col(name) >= 0 ? cells[col(name)] ?? '' : '');
    const bookingDate = isoDate(cell('bookingDate'));
    const amount = germanNumber(cell('value'));
    const bookingText = cell('text');
    if (!bookingDate || !isFinite(amount) || amount === 0) continue;
    const isTax = PREPAID_TAX_TEXT.test(bookingText);
    // Erstattungen der Vorabpauschale (positiv) als negative Vorauszahlung zählen
    const isDividend = !isTax && amount > 0 && (DISTRIBUTION_KIND.test(cell('kind')) || DISTRIBUTION_TEXT.test(bookingText));
    if (!isTax && !isDividend) continue;
    const id = instrumentFromText(bookingText, known);
    if (!id) {
      unassigned++;
      continue;
    }
    const base = `${isTax ? 'tax' : 'div'}|${bookingDate}|${id}|${amount}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    transactions.push({
      transactionId: `csv:${base}|${n}`,
      source: 'csv',
      bookingStatus: 'BOOKED',
      bookingDate,
      businessDate: isoDate(cell('valuta')) ?? bookingDate,
      quantity: { value: '0' },
      instrument: ISIN.test(id) ? { isin: id } : { wkn: id },
      // Vorabpauschale: Belastung positiv, Erstattung negativ
      transactionValue: { value: String(isTax ? -amount : amount), unit: 'EUR' },
      transactionType: { key: isTax ? 'PREPAID_TAX' : 'DIVIDEND' },
    });
    if (isTax) {
      prepaidTaxes++;
      prepaidTaxTotal += -amount;
    } else {
      dividends++;
      total += amount;
    }
  }
  const dates = transactions.map((t) => t.bookingDate!).sort();
  return { kind: 'account', transactions, dividends, total, prepaidTaxes, prepaidTaxTotal, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null, unassigned };
}

/** Erkennt, welcher Export es ist: Depotumsätze oder Umsätze des Verrechnungskontos. */
export function parseComdirectCsv(text: string, known: Set<string>): ImportResult {
  const isAccount = text
    .split(/\r?\n/)
    .slice(0, 30)
    .some((l) => {
      const cells = splitRow(l).map(key);
      return cells.includes(ACCOUNT_COLUMNS.text) && cells.includes(ACCOUNT_COLUMNS.kind);
    });
  return isAccount ? parseAccountCsv(text, known) : parseDepotCsv(text);
}

/** WKNs und ISINs aller Papiere, die die App aus Positionen und Umsätzen kennt. */
export function knownInstrumentIds(stored: StoredPortfolio): Set<string> {
  const ids = new Set<string>();
  for (const i of [...stored.raw.positions.map((p) => p.instrument), ...stored.raw.transactions.map((t) => t.instrument)]) {
    if (i?.wkn) ids.add(i.wkn.toUpperCase());
    if (i?.isin) ids.add(i.isin.toUpperCase());
  }
  return ids;
}
