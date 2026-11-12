// Abruf der Depotdaten und Umrechnung ins Format der App.
// Das Mapping ist rein (ohne Netzwerk), damit es sich mit Beispiel-JSON testen lässt.

import { Instrument, PortfolioData, PricePoint, PriceHistory, Transaction } from '../types';
import { BENCHMARK, MarketData, pointAt, Quote } from '../market/yahoo';
import { ComdirectApi, ComdirectError } from './api';

interface AmountValue {
  value: string;
  unit?: string;
}

interface RawInstrument {
  instrumentId?: string;
  wkn?: string;
  isin?: string;
  name?: string;
  shortName?: string;
  staticData?: { instrumentType?: string };
}

export interface RawPosition {
  wkn?: string;
  quantity: AmountValue;
  currentPrice?: { price: AmountValue; priceDateTime?: string };
  purchasePrice?: AmountValue | null;
  /** Anschaffungswert der Position inkl. Kaufgebühren (so rechnet comdirect „seit Kauf“) */
  purchaseValue?: AmountValue | null;
  currentValue?: AmountValue;
  instrument?: RawInstrument;
}

export interface RawTransaction {
  transactionId?: string;
  /** 'csv' = aus dem CSV-Export von comdirect.de importiert (statt über die Schnittstelle) */
  source?: 'csv';
  bookingStatus?: string;
  bookingDate?: string | null;
  businessDate?: string;
  quantity?: AmountValue;
  instrumentId?: string;
  instrument?: RawInstrument | null;
  executionPrice?: AmountValue;
  transactionValue?: AmountValue;
  transactionDirection?: string;
  transactionType?: { key?: string } | string;
}

export interface RawPortfolio {
  positions: RawPosition[];
  transactions: RawTransaction[];
}

/** Kurse aus einem früheren Abruf; daraus wächst der Chart mit jedem Abruf. */
export interface Snapshot {
  date: string;
  prices: Record<string, number>;
}

interface Paged<T> {
  paging?: { index?: number; matches?: number };
  values?: T[];
}

const PAGE_SIZE = 500;
const MAX_PAGES = 20;

/** Holt Positionen und Umsätze aller Depots (alle Seiten). */
export async function fetchRawPortfolio(api: ComdirectApi, accessToken: string): Promise<RawPortfolio> {
  const depots = await api.get<Paged<{ depotId: string }>>(accessToken, '/brokerage/clients/user/v3/depots');
  const positions: RawPosition[] = [];
  const transactions: RawTransaction[] = [];
  for (const { depotId } of depots.values ?? []) {
    const pos = await api.get<Paged<RawPosition>>(accessToken, `/brokerage/v3/depots/${depotId}/positions`, { 'with-attr': 'instrument' });
    positions.push(...(pos.values ?? []));
    // Ohne Datumsfilter liefert comdirect nur etwa die letzten 180 Tage. Mit min-bookingDate
    // kommt (laut Erfahrungsberichten) mehr; lehnt comdirect den Filter ab, ohne ihn erneut.
    try {
      transactions.push(...(await fetchTransactions(api, accessToken, depotId, { 'min-bookingDate': yearsAgo(HISTORY_YEARS) })));
    } catch (e) {
      if (!(e instanceof ComdirectError) || (e.status !== 400 && e.status !== 422)) throw e;
      transactions.push(...(await fetchTransactions(api, accessToken, depotId, {})));
    }
  }
  return { positions, transactions };
}

const HISTORY_YEARS = 10;

function yearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Alle Seiten der Depotumsätze, bis paging.matches erreicht ist (auch falls comdirect kleinere Seiten liefert). */
async function fetchTransactions(api: ComdirectApi, accessToken: string, depotId: string, filter: Record<string, string>) {
  const transactions: RawTransaction[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await api.get<Paged<RawTransaction>>(accessToken, `/brokerage/v3/depots/${depotId}/transactions`, {
      ...filter,
      'paging-first': transactions.length,
      'paging-count': PAGE_SIZE,
    });
    const values = result.values ?? [];
    transactions.push(...values);
    if (values.length === 0 || transactions.length >= (result.paging?.matches ?? transactions.length)) break;
  }
  return transactions;
}

/** Erkennungsmerkmal eines Umsatzes über Abrufe hinweg; ohne transactionId aus den Eckdaten. */
function txKey(t: RawTransaction): string {
  if (t.transactionId) return `id:${t.transactionId}`;
  const type = typeof t.transactionType === 'string' ? t.transactionType : t.transactionType?.key;
  return ['tx', t.bookingDate ?? t.businessDate, idOf(t.instrument, t.instrumentId), type, t.quantity?.value, t.transactionValue?.value].join('|');
}

/**
 * Führt gespeicherte und neu abgerufene Umsätze zusammen. comdirect liefert nur ein begrenztes
 * Zeitfenster; so bleiben ältere Umsätze aus früheren Abrufen erhalten. Gilt ein Umsatz in beiden,
 * gewinnt der neue. Nicht gebuchte Umsätze zählen nur aus dem neuen Abruf (sie ändern sich noch).
 */
export function mergeTransactions(stored: RawTransaction[], fresh: RawTransaction[]): RawTransaction[] {
  const merged = new Map<string, RawTransaction>();
  for (const t of stored) if (!t.bookingStatus || t.bookingStatus === 'BOOKED') merged.set(txKey(t), t);
  for (const t of fresh) merged.set(txKey(t), t);
  return dedupeCsvAgainstBank([...merged.values()]);
}

const sideOf = (t: RawTransaction) => {
  const k = typeKey(t.transactionType);
  return k === 'BUY' || k === 'TRANSFER_IN' ? 'buy' : k === 'SELL' || k === 'TRANSFER_OUT' ? 'sell' : 'other';
};
const idsOf = (t: RawTransaction) => [t.instrument?.isin, t.instrument?.wkn, t.instrumentId].filter((x): x is string => !!x);

/**
 * Entfernt importierte CSV-Umsätze, die comdirect auch über die Schnittstelle geliefert hat
 * (gleiches Papier per WKN/ISIN, gleicher Tag, gleiche Richtung und Stückzahl). Die Schnittstelle gewinnt.
 */
export function dedupeCsvAgainstBank(transactions: RawTransaction[]): RawTransaction[] {
  const bank = transactions.filter((t) => t.source !== 'csv' && (!t.bookingStatus || t.bookingStatus === 'BOOKED'));
  const same = (csv: RawTransaction, b: RawTransaction) =>
    sideOf(csv) !== 'other' &&
    sideOf(csv) === sideOf(b) &&
    Math.abs(Math.abs(num(csv.quantity)) - Math.abs(num(b.quantity))) < 1e-6 &&
    ((!!csv.bookingDate && csv.bookingDate === b.bookingDate) || (!!csv.businessDate && csv.businessDate === b.businessDate)) &&
    idsOf(csv).some((id) => idsOf(b).includes(id));
  return transactions.filter((t) => t.source !== 'csv' || !bank.some((b) => same(t, b)));
}

const num = (a?: AmountValue | null) => (a?.value !== undefined ? Number(a.value) : NaN);
const idOf = (i?: RawInstrument | null, fallback?: string) => i?.isin || i?.wkn || fallback || '';
const kindOf = (type?: string): Instrument['kind'] => (type === 'ETF' ? 'ETF' : type === 'SHARE' ? 'Aktie' : 'Sonstige');
const typeKey = (t: RawTransaction['transactionType']) => (typeof t === 'string' ? t : t?.key);

/** Aktuelle Kurse als Snapshot für spätere Abrufe. */
export function snapshotOf(raw: RawPortfolio, date: string): Snapshot {
  const prices: Record<string, number> = {};
  for (const p of raw.positions) {
    const price = num(p.currentPrice?.price);
    if (isFinite(price)) prices[idOf(p.instrument, p.wkn)] = price;
  }
  return { date, prices };
}

/**
 * comdirect-Daten → PortfolioData. Fehlt Historie (Bestand laut Umsätzen ≠ echter Bestand),
 * wird ein Eröffnungskauf ergänzt, damit Bestand und Wert stimmen: zum Marktkurs an dem Tag,
 * falls es eine Kurshistorie gibt (dann zählt die Rendite ab da), sonst zum Einstandskurs.
 * Kurse von comdirect (Umsätze, Abrufe) haben Vorrang vor der Kurshistorie.
 * Gibt es neuere Kurse als den Abruf, wird der letzte bekannte Bestand damit bewertet (Schätzung):
 * asOf ist dann der Tag des neuesten Kurses, source.pricedAt dessen Zeitpunkt.
 * @param asOf Tag des comdirect-Abrufs
 */
export function mapPortfolio(
  raw: RawPortfolio,
  snapshots: Snapshot[],
  asOf: string,
  fetchedAt: string,
  market?: Pick<MarketData, 'series' | 'benchmark' | 'quotes' | 'benchmarkQuote'> | null,
): PortfolioData {
  // Der CSV-Export kennt nur die WKN: über die Daten der Schnittstelle der ISIN zuordnen
  const isinOfWkn = new Map<string, string>();
  for (const i of [...raw.positions.map((p) => p.instrument), ...raw.transactions.map((t) => t.instrument)]) {
    if (i?.wkn && i.isin) isinOfWkn.set(i.wkn, i.isin);
  }
  const resolve = (id: string) => isinOfWkn.get(id) ?? id;

  const instruments = new Map<string, Instrument>();
  const addInstrument = (i: RawInstrument | null | undefined, fallback?: string) => {
    const isin = resolve(idOf(i, fallback));
    if (!isin || instruments.has(isin)) return isin;
    instruments.set(isin, {
      isin,
      ...(i?.wkn ? { wkn: i.wkn } : {}),
      name: i?.name ?? isin,
      shortName: i?.shortName || i?.name || isin,
      kind: kindOf(i?.staticData?.instrumentType),
    });
    return isin;
  };

  const points = new Map<string, Map<string, number>>();
  const addPrice = (isin: string, date: string, price: number) => {
    if (!isin || !isFinite(price) || price <= 0) return;
    if (!points.has(isin)) points.set(isin, new Map());
    points.get(isin)!.set(date, price);
  };

  // Namen und Art aus den Positionen zuerst, die Angaben im CSV-Export sind knapper
  for (const p of raw.positions) addInstrument(p.instrument, p.wkn);

  // Kurshistorie zuerst, damit comdirect-Kurse am selben Tag sie überschreiben
  // (nur für Papiere, die im Depot sind oder waren)
  const known = new Set([...raw.positions.map((p) => resolve(idOf(p.instrument, p.wkn))), ...raw.transactions.map((t) => resolve(idOf(t.instrument, t.instrumentId)))]);
  // Nur Kurse, die nach dem Abruf entstanden sind, können den Abrufstand ablösen
  const newer = Object.entries(market?.quotes ?? {}).filter(([isin, q]) => known.has(isin) && q.time > fetchedAt && q.date >= asOf);
  const valuationDay = newer.reduce((d, [, q]) => (q.date > d ? q.date : d), asOf);
  const pricedAt = newer.reduce<string | null>((t, [, q]) => (!t || q.time > t ? q.time : t), null);
  for (const [isin, series] of Object.entries(market?.series ?? {})) {
    if (known.has(isin)) for (const p of series) if (p.date <= valuationDay) addPrice(isin, p.date, p.price);
  }

  // Umsätze
  const transactions: Transaction[] = [];
  const prepaidTax: Record<string, number> = {};
  for (const t of raw.transactions) {
    if (t.bookingStatus && t.bookingStatus !== 'BOOKED') continue;
    const kind = typeKey(t.transactionType);
    if (kind === 'PREPAID_TAX') {
      // Steuer auf die Vorabpauschale: nur zur Info, nicht in der Rendite (wird beim Verkauf angerechnet)
      const isin = addInstrument(t.instrument, t.instrumentId);
      const amount = num(t.transactionValue);
      if (isin && isFinite(amount)) prepaidTax[isin] = (prepaidTax[isin] ?? 0) + amount;
      continue;
    }
    if (kind === 'DIVIDEND') {
      // Ausschüttung/Dividende (aus den Kontoumsätzen): Geld fließt aus dem Depot an dich, Stückzahl bleibt
      const date = t.bookingDate || t.businessDate;
      const amount = Math.abs(num(t.transactionValue));
      const isin = addInstrument(t.instrument, t.instrumentId);
      if (date && isin && amount > 0) transactions.push({ date, isin, type: 'dividend', quantity: 0, amount, fees: 0 });
      continue;
    }
    const type = kind === 'BUY' || kind === 'TRANSFER_IN' ? 'buy' : kind === 'SELL' || kind === 'TRANSFER_OUT' ? 'sell' : null;
    const date = t.bookingDate || t.businessDate;
    const quantity = Math.abs(num(t.quantity));
    if (!type || !date || !isFinite(quantity) || quantity === 0) continue;
    const isin = addInstrument(t.instrument, t.instrumentId);
    const price = num(t.executionPrice);
    const value = Math.abs(num(t.transactionValue));
    const amount = isFinite(value) && value > 0 ? value : quantity * price;
    if (!isin || !isFinite(amount)) continue;
    transactions.push({ date, isin, type, quantity, amount, fees: 0 });
    addPrice(isin, date, isFinite(price) && price > 0 ? price : amount / quantity);
  }
  transactions.sort((a, b) => a.date.localeCompare(b.date));

  // Frühere Abrufe
  for (const s of snapshots) for (const [isin, price] of Object.entries(s.prices)) addPrice(isin, s.date, price);

  // Aktueller Bestand und Abgleich
  const firstDate = transactions[0]?.date ?? asOf;
  const costBasis: Record<string, number> = {};
  for (const p of raw.positions) {
    const isin = addInstrument(p.instrument, p.wkn);
    const held = num(p.quantity);
    const current = num(p.currentPrice?.price) || num(p.currentValue) / held;
    addPrice(isin, asOf, current);
    const cost = num(p.purchaseValue);
    if (isin && isFinite(cost)) costBasis[isin] = (costBasis[isin] ?? 0) + cost;

    const fromTx = transactions
      .filter((t) => t.isin === isin)
      .reduce((q, t) => q + (t.type === 'buy' ? t.quantity : -t.quantity), 0);
    const missing = held - fromTx;
    if (missing > 1e-6) {
      const history = market?.series[isin];
      const marketPrice = history?.length && history[0].date <= firstDate ? pointAt(history, firstDate) : null;
      // Sonst durchschnittlicher Einstand je Stück; der Anschaffungswert enthält auch die Kaufgebühren
      const price = marketPrice ?? (cost > 0 && held > 0 ? cost / held : num(p.purchasePrice) || current);
      transactions.unshift({ date: firstDate, isin, type: 'buy', quantity: missing, amount: missing * price, fees: 0 });
      if (!points.get(isin)?.has(firstDate)) addPrice(isin, firstDate, price);
    } else if (missing < -1e-6) {
      transactions.push({ date: asOf, isin, type: 'sell', quantity: -missing, amount: -missing * current, fees: 0 });
    }
  }

  // Papiere, die nicht mehr im Depot sind: Bestand laut Umsätzen muss 0 ergeben. Wurde vor dem
  // ersten bekannten Umsatz gekauft und danach verkauft, fehlt der Kauf → Eröffnungskauf ergänzen.
  const heldNow = new Set(raw.positions.map((p) => resolve(idOf(p.instrument, p.wkn))));
  for (const isin of new Set(transactions.map((t) => t.isin))) {
    if (heldNow.has(isin)) continue;
    const net = transactions.filter((t) => t.isin === isin).reduce((q, t) => q + (t.type === 'buy' ? t.quantity : t.type === 'sell' ? -t.quantity : 0), 0);
    const known = [...(points.get(isin)?.entries() ?? [])].sort(([a], [b]) => a.localeCompare(b));
    if (!known.length) continue;
    if (net < -1e-6) {
      const history = market?.series[isin];
      const price = (history?.length && history[0].date <= firstDate ? pointAt(history, firstDate) : null) ?? known[0][1];
      transactions.unshift({ date: firstDate, isin, type: 'buy', quantity: -net, amount: -net * price, fees: 0 });
    } else if (net > 1e-6) {
      // Abgang ohne sichtbaren Umsatz (z. B. Übertrag): zum letzten Kurs ausbuchen
      transactions.push({ date: asOf, isin, type: 'sell', quantity: net, amount: net * known[known.length - 1][1], fees: 0 });
    }
  }

  // Neuere Kurse zuletzt, damit sie am selben Tag den Abrufkurs ablösen
  for (const [isin, q] of newer) addPrice(isin, q.date, q.price);

  const prices: PriceHistory = {};
  for (const [isin, byDate] of points) {
    prices[isin] = [...byDate.entries()].map(([date, price]): PricePoint => ({ date, price })).sort((a, b) => a.date.localeCompare(b.date));
  }

  const benchmark = market?.benchmark?.length ? { isin: BENCHMARK.key, name: BENCHMARK.name } : null;
  if (benchmark) prices[BENCHMARK.key] = withQuote(market!.benchmark!, market?.benchmarkQuote, valuationDay);

  return {
    // Ohne Kurse lässt sich ein Instrument nicht bewerten
    instruments: [...instruments.values()].filter((i) => prices[i.isin]?.length),
    transactions: transactions.filter((t) => prices[t.isin]?.length).sort((a, b) => a.date.localeCompare(b.date)),
    prices,
    benchmark: benchmark && prices[BENCHMARK.key].length ? benchmark : null,
    asOf: valuationDay,
    costBasis,
    prepaidTax,
    source: { kind: 'comdirect', fetchedAt, ...(pricedAt ? { pricedAt } : {}) },
  };
}

/** Kursreihe bis zum Stichtag, ergänzt um den aktuellen Kurs (falls er bis dahin reicht). */
function withQuote(points: PricePoint[], quote: Quote | null | undefined, until: string): PricePoint[] {
  const result = points.filter((p) => p.date <= until);
  if (!quote || quote.date > until) return result;
  return [...result.filter((p) => p.date < quote.date), { date: quote.date, price: quote.price }];
}
