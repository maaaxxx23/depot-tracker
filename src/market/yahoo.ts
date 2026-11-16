// Kurshistorie von Yahoo Finance (inoffizielle Schnittstelle, ohne Schlüssel).
// Yahoo sieht dabei nur, welche ISINs abgefragt werden, keine Stückzahlen oder Beträge.
// Alles hier ist austauschbar: später kann ein Dienst mit Schlüssel dieselbe MarketData liefern.

import type { PricePoint } from '../types';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const BASE = 'https://query1.finance.yahoo.com';
// Ohne Browser-Kennung antwortet Yahoo gelegentlich mit 429
const HEADERS = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };

export interface BenchmarkChoice {
  key: string;
  symbol: string;
  name: string;
}

/**
 * Wählbare Vergleichsindizes: jeweils ein thesaurierender ETF an einer Euro-Börse,
 * also inklusive Dividenden und ohne Währungsumrechnung.
 */
export const BENCHMARKS: readonly BenchmarkChoice[] = [
  { key: 'BENCHMARK:MSCI-WORLD', symbol: 'EUNL.DE', name: 'MSCI World' },
  { key: 'BENCHMARK:SP500', symbol: 'SXR8.DE', name: 'S&P 500' },
  { key: 'BENCHMARK:FTSE-ALL-WORLD', symbol: 'VWCE.DE', name: 'FTSE All-World' },
  { key: 'BENCHMARK:MSCI-EM', symbol: 'IS3N.DE', name: 'MSCI EM' },
  { key: 'BENCHMARK:NASDAQ-100', symbol: 'SXRV.DE', name: 'Nasdaq 100' },
];

/** Vorgabe: MSCI World. */
export const BENCHMARK = BENCHMARKS[0];

/** Index zu einem gespeicherten Schlüssel; Unbekanntes (auch alte Stände ohne Schlüssel) fällt auf die Vorgabe zurück. */
export const benchmarkByKey = (key: string | null | undefined): BenchmarkChoice => BENCHMARKS.find((b) => b.key === key) ?? BENCHMARK;

/** Weicht Yahoos letzter Kurs stärker vom comdirect-Kurs ab, ist es vermutlich ein anderes Papier. */
const MAX_DEVIATION = 0.15;

/** Aktueller Kurs in EUR mit Handelszeitpunkt. */
export interface Quote {
  date: string; // Handelstag an der Börse
  time: string; // ISO-Zeitpunkt des Kurses
  price: number;
}

export interface MarketData {
  fetchedAt: string;
  /** Abgefragte ISINs, auch die ohne Treffer; so wird erst bei neuen Positionen wieder gesucht */
  isins: string[];
  /** Wochenkurse in EUR je ISIN */
  series: Record<string, PricePoint[]>;
  benchmark: PricePoint[] | null;
  /** Welcher Vergleichsindex geladen wurde; fehlt in alten Ständen (dann MSCI World) */
  benchmarkKey?: string;
  /** Gefundene Yahoo-Symbole je ISIN (nur für übernommene Kursreihen) */
  symbols?: Record<string, string>;
  /** Aktuelle Kurse, alle 15 Minuten neu */
  quotes?: Record<string, Quote>;
  benchmarkQuote?: Quote | null;
  quotedAt?: string;
}

async function getJson(fetchImpl: FetchLike, url: string): Promise<any> {
  const res = await fetchImpl(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Yahoo antwortet mit ${res.status}`);
  return res.json();
}

const EUR_SUFFIX = /\.(DE|F|MU|SG|DU|BE|HM|HA|AS|PA|MI|VI|BR|MC|LS|HE|IR)$/;

/** ISIN → Yahoo-Symbol; Börsen im Euroraum zuerst. */
export async function findSymbol(fetchImpl: FetchLike, isin: string): Promise<string | null> {
  const json = await getJson(fetchImpl, `${BASE}/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=10&newsCount=0`);
  const quotes: { symbol?: string }[] = (json?.quotes ?? []).filter((q: { symbol?: string }) => typeof q.symbol === 'string');
  return (quotes.find((q) => EUR_SUFFIX.test(q.symbol!)) ?? quotes[0])?.symbol ?? null;
}

const isoDate = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);

const DAY_MS = 24 * 60 * 60 * 1000;

/** Aktueller Kurs in der Handelswährung (aus den Metadaten der Tageskurse). */
export async function fetchQuote(fetchImpl: FetchLike, symbol: string): Promise<{ currency: string; quote: Quote }> {
  const json = await getJson(fetchImpl, `${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`);
  const meta = json?.chart?.result?.[0]?.meta;
  const quote = quoteOf(meta);
  if (!quote) throw new Error(`Kein aktueller Kurs für ${symbol}`);
  return { currency: meta.currency ?? 'EUR', quote };
}

function quoteOf(meta: any): Quote | null {
  const price = meta?.regularMarketPrice;
  const time = meta?.regularMarketTime;
  if (typeof price !== 'number' || !(price > 0) || typeof time !== 'number') return null;
  return { date: isoDate(time + (meta.gmtoffset ?? 0)), time: new Date(time * 1000).toISOString(), price };
}

/** Wochenschlusskurse der letzten 10 Jahre in der Handelswährung. */
export async function fetchChart(fetchImpl: FetchLike, symbol: string): Promise<{ currency: string; points: PricePoint[] }> {
  const json = await getJson(fetchImpl, `${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1wk`);
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Keine Kurse für ${symbol}`);
  const offset: number = result.meta?.gmtoffset ?? 0;
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
  const byDate = new Map<string, number>();
  (result.timestamp ?? []).forEach((t: number, i: number) => {
    const price = closes[i];
    if (typeof price === 'number' && isFinite(price) && price > 0) byDate.set(isoDate(t + offset), price);
  });
  const points = [...byDate.entries()].map(([date, price]) => ({ date, price })).sort((a, b) => a.date.localeCompare(b.date));
  // Die laufende Woche trägt das Datum ihres Montags, aber den heutigen Kurs: durch den echten Tag ersetzen
  const latest = quoteOf(result.meta);
  const last = points[points.length - 1];
  if (latest && last && Date.parse(latest.date) - Date.parse(last.date) < 7 * DAY_MS) {
    points.pop();
    if (!points.length || points[points.length - 1].date < latest.date) points.push({ date: latest.date, price: latest.price });
  }
  return { currency: result.meta?.currency ?? 'EUR', points };
}

/** Letzter Wert an oder vor dem Datum (vor dem ersten Punkt: der erste). */
export function pointAt(points: PricePoint[], date: string): number | null {
  if (!points.length) return null;
  let value = points[0].price;
  for (const p of points) {
    if (p.date > date) break;
    value = p.price;
  }
  return value;
}

/** Rechnet eine Kursreihe in Euro um (Pence an der Londoner Börse inklusive). */
async function inEur(fetchImpl: FetchLike, chart: { currency: string; points: PricePoint[] }): Promise<PricePoint[]> {
  let currency = chart.currency;
  let factor = 1;
  if (currency === 'GBp' || currency === 'GBX') {
    currency = 'GBP';
    factor = 0.01;
  }
  if (currency === 'EUR') return chart.points.map((p) => ({ date: p.date, price: p.price * factor }));
  const fx = (await fetchChart(fetchImpl, `${currency}EUR=X`)).points;
  if (!fx.length) throw new Error(`Kein Wechselkurs für ${currency}`);
  return chart.points.map((p) => ({ date: p.date, price: p.price * factor * pointAt(fx, p.date)! }));
}

/**
 * Holt Kurshistorien für die angegebenen Positionen und den Vergleichsindex.
 * Einzelne Fehlschläge werden übersprungen; die App nutzt dann nur die comdirect-Kurse.
 * @param current ISIN → aktueller Kurs laut comdirect (zur Plausibilitätsprüfung)
 */
export async function loadMarketData(fetchImpl: FetchLike, current: Record<string, number>, benchmarkChoice: BenchmarkChoice = BENCHMARK, now = new Date()): Promise<MarketData> {
  const series: Record<string, PricePoint[]> = {};
  const symbols: Record<string, string> = {};
  // Nacheinander statt parallel, um Yahoo nicht mit Anfragen zu fluten
  for (const [isin, price] of Object.entries(current)) {
    try {
      const symbol = await findSymbol(fetchImpl, isin);
      if (!symbol) continue;
      const points = await inEur(fetchImpl, await fetchChart(fetchImpl, symbol));
      const last = points[points.length - 1]?.price;
      if (last && Math.abs(last / price - 1) <= MAX_DEVIATION) {
        series[isin] = points;
        symbols[isin] = symbol;
      }
    } catch {
      // Ohne Yahoo-Kurse geht es mit den comdirect-Kursen weiter
    }
  }
  let benchmark: PricePoint[] | null = null;
  try {
    const points = await inEur(fetchImpl, await fetchChart(fetchImpl, benchmarkChoice.symbol));
    benchmark = points.length ? points : null;
  } catch {
    benchmark = null;
  }
  return { fetchedAt: now.toISOString(), isins: Object.keys(current), series, benchmark, benchmarkKey: benchmarkChoice.key, symbols };
}

/** Wechselkurs in EUR je Währung, pro Abruf nur einmal geladen. */
async function eurFactor(fetchImpl: FetchLike, currency: string, cache: Map<string, number>): Promise<number> {
  let factor = 1;
  if (currency === 'GBp' || currency === 'GBX') {
    currency = 'GBP';
    factor = 0.01;
  }
  if (currency === 'EUR') return factor;
  if (!cache.has(currency)) cache.set(currency, (await fetchQuote(fetchImpl, `${currency}EUR=X`)).quote.price);
  return factor * cache.get(currency)!;
}

/** Größere Sprünge zum letzten Wochenkurs gelten als Fehler (falsches Papier oder Datenpanne). */
const MAX_QUOTE_JUMP = 0.25;

/** Holt die aktuellen Kurse zu den bereits gefundenen Symbolen; Fehlschläge werden übersprungen. */
export async function loadQuotes(fetchImpl: FetchLike, market: MarketData, now = new Date()): Promise<MarketData> {
  const fx = new Map<string, number>();
  const toEur = async (symbol: string, reference: PricePoint[] | null | undefined): Promise<Quote | null> => {
    try {
      const { currency, quote } = await fetchQuote(fetchImpl, symbol);
      const price = quote.price * (await eurFactor(fetchImpl, currency, fx));
      const last = reference?.[reference.length - 1]?.price;
      if (last && Math.abs(price / last - 1) > MAX_QUOTE_JUMP) return null;
      return { ...quote, price };
    } catch {
      return null;
    }
  };
  const quotes: Record<string, Quote> = {};
  for (const [isin, symbol] of Object.entries(market.symbols ?? {})) {
    const quote = await toEur(symbol, market.series[isin]);
    if (quote) quotes[isin] = quote;
  }
  const benchmarkQuote = market.benchmark ? await toEur(benchmarkByKey(market.benchmarkKey).symbol, market.benchmark) : null;
  return { ...market, quotes, benchmarkQuote, quotedAt: now.toISOString() };
}

const QUOTE_MAX_AGE_MS = 15 * 60 * 1000;

export function quotesStale(market: MarketData, now = new Date()): boolean {
  return !market.quotedAt || now.getTime() - new Date(market.quotedAt).getTime() > QUOTE_MAX_AGE_MS;
}

const MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** Neu laden, wenn der Stand älter als 12 Stunden ist oder neue Positionen dazugekommen sind. */
export function needsRefresh(market: MarketData | null, isins: string[], now = new Date()): boolean {
  if (!market) return true;
  if (now.getTime() - new Date(market.fetchedAt).getTime() > MAX_AGE_MS) return true;
  return isins.some((isin) => !market.isins.includes(isin));
}
