// Tagesbewegung der größten Firmen im Depot („Top-Bewegungen“): Börsenkürzel über Yahoos Suche
// (wie bei den Geschäftsbereichen), Tageskurs über dieselbe Adresse wie die übrigen Kurse.
// Yahoo sieht dabei nur Firmennamen aus den öffentlichen Bestandslisten, keine Stückzahlen oder Beträge.

import { companyKey } from '../finance/composition';
import type { CompanyQuery } from './industries';
import type { FetchLike } from './yahoo';

const BASE = 'https://query1.finance.yahoo.com';
const HEADERS = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };

/** So viele der größten Firmen werden abgefragt. */
export const MAX_MOVERS = 10;

export interface MoverQuote {
  /** Tagesbewegung als Bruchteil (−0,051 = −5,1 %), gegenüber dem Vortagesschluss der Heimatbörse */
  change: number;
  /** Handelstag, auf den sich die Bewegung bezieht */
  date: string;
}

export interface MoverCache {
  quotedAt: string;
  /** Börsenkürzel je Firma (companyKey); null = Suche blieb ohne Treffer */
  symbols: Record<string, string | null>;
  /** Tagesbewegung je Firma (companyKey) */
  quotes: Record<string, MoverQuote>;
}

const firstWord = (name: string) => companyKey(name).split(' ')[0] ?? '';

/** Sucht das Börsenkürzel einer Firma; null, wenn kein passender Treffer dabei ist. */
export async function findEquitySymbol(fetchImpl: FetchLike, name: string): Promise<string | null> {
  const res = await fetchImpl(`${BASE}/v1/finance/search?q=${encodeURIComponent(name)}&quotesCount=6&newsCount=0`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Yahoo antwortet mit ${res.status}`);
  const quotes: any[] = (await res.json())?.quotes ?? [];
  const wanted = firstWord(name);
  for (const q of quotes) {
    if (q?.quoteType !== 'EQUITY' || typeof q.symbol !== 'string' || !q.symbol) continue;
    // Nur Treffer, deren Name mit demselben Wort beginnt: „SAP“ darf nicht bei „Saputo“ landen
    const names = [q.longname, q.shortname].filter((n): n is string => typeof n === 'string');
    if (wanted && names.some((n) => firstWord(n) === wanted)) return q.symbol;
  }
  return null;
}

/** Größere Sprünge gelten als Datenpanne und werden verworfen. */
const MAX_DAY_MOVE = 0.5;

/** Tagesbewegung eines Kürzels; die Prozentzahl braucht keine Währungsumrechnung. */
export async function fetchDayChange(fetchImpl: FetchLike, symbol: string): Promise<MoverQuote> {
  const res = await fetchImpl(`${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Yahoo antwortet mit ${res.status}`);
  const meta = (await res.json())?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  const previous = meta?.chartPreviousClose;
  const time = meta?.regularMarketTime;
  if (typeof price !== 'number' || !(price > 0) || typeof previous !== 'number' || !(previous > 0) || typeof time !== 'number') {
    throw new Error(`Keine Tagesbewegung für ${symbol}`);
  }
  const change = price / previous - 1;
  if (Math.abs(change) > MAX_DAY_MOVE) throw new Error(`Unplausible Tagesbewegung für ${symbol}`);
  return { change, date: new Date((time + (meta.gmtoffset ?? 0)) * 1000).toISOString().slice(0, 10) };
}

const MAX_AGE_MS = 15 * 60 * 1000;

/** Neu laden, wenn der Stand älter als 15 Minuten ist. */
export function moversStale(cache: MoverCache | null, now = new Date()): boolean {
  return !cache?.quotedAt || now.getTime() - Date.parse(cache.quotedAt) > MAX_AGE_MS;
}

/**
 * Holt die Tagesbewegung der angegebenen Firmen (höchstens MAX_MOVERS).
 * Bekannte Kürzel werden wiederverwendet; erfolglose Suchen werden erst am nächsten Tag wiederholt.
 * Gibt null zurück, wenn der Stand noch frisch ist oder gar nichts geladen werden konnte.
 */
export async function loadMovers(fetchImpl: FetchLike, companies: CompanyQuery[], cache: MoverCache | null, now = new Date()): Promise<MoverCache | null> {
  if (!moversStale(cache, now)) return null;
  const symbols: Record<string, string | null> = { ...cache?.symbols };
  const retryFailed = (cache?.quotedAt ?? '').slice(0, 10) !== now.toISOString().slice(0, 10);
  const quotes: Record<string, MoverQuote> = {};
  let loaded = false;
  // Nacheinander statt parallel, um Yahoo nicht mit Anfragen zu fluten
  for (const c of companies.slice(0, MAX_MOVERS)) {
    if (!c.key) continue;
    try {
      if (symbols[c.key] === undefined || (symbols[c.key] === null && retryFailed)) {
        // Erst mit dem angezeigten Namen, dann mit dem bereinigten (ohne „Inc“, „AG“, „Class A“ …)
        let symbol = await findEquitySymbol(fetchImpl, c.label);
        if (!symbol && c.key.toUpperCase() !== c.label.toUpperCase()) symbol = await findEquitySymbol(fetchImpl, c.key);
        symbols[c.key] = symbol;
      }
      const symbol = symbols[c.key];
      if (!symbol) continue;
      quotes[c.key] = await fetchDayChange(fetchImpl, symbol);
      loaded = true;
    } catch {
      // Diese Firma überspringen; offline schlagen alle fehl und der alte Stand bleibt
      continue;
    }
  }
  if (!loaded) return null;
  return { quotedAt: now.toISOString(), symbols, quotes };
}
