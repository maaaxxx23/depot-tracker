// Geschäftsbereich einer Firma („Halbleiter“, „Autohersteller“ …) über Yahoos Suche.
// Das ist dieselbe Adresse, über die die App schon das Börsenkürzel zu einer ISIN findet.
// Yahoo sieht dabei nur Firmennamen aus den öffentlichen Bestandslisten, keine Stückzahlen oder Beträge.

import { companyKey } from '../finance/composition';
import type { FetchLike } from './yahoo';

const BASE = 'https://query1.finance.yahoo.com';
const HEADERS = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };

export interface IndustryEntry {
  /** Geschäftsbereich in Yahoos Schreibweise, z. B. „Semiconductors“; null = nichts gefunden */
  industry: string | null;
  checkedAt: string;
}

/** Schlüssel: companyKey der Firma */
export type IndustryCache = Record<string, IndustryEntry>;

/** Höchstens so viele Suchanfragen pro Durchlauf, damit Yahoo nicht mit Anfragen geflutet wird. */
const MAX_LOOKUPS = 30;
/** Firmen ohne Treffer werden frühestens nach dieser Zeit erneut gesucht. */
const RETRY_MS = 30 * 24 * 60 * 60 * 1000;

const firstWord = (name: string) => companyKey(name).split(' ')[0] ?? '';

/** Sucht eine Firma und liefert ihren Geschäftsbereich; null, wenn kein passender Treffer dabei ist. */
export async function findIndustry(fetchImpl: FetchLike, name: string): Promise<string | null> {
  const res = await fetchImpl(`${BASE}/v1/finance/search?q=${encodeURIComponent(name)}&quotesCount=6&newsCount=0`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Yahoo antwortet mit ${res.status}`);
  const quotes: any[] = (await res.json())?.quotes ?? [];
  const wanted = firstWord(name);
  for (const q of quotes) {
    if (q?.quoteType !== 'EQUITY' || typeof q.industry !== 'string' || !q.industry.trim()) continue;
    // Nur Treffer, deren Name mit demselben Wort beginnt: „SAP“ darf nicht bei „Saputo“ landen
    const names = [q.longname, q.shortname].filter((n): n is string => typeof n === 'string');
    if (wanted && names.some((n) => firstWord(n) === wanted)) return q.industry.trim();
  }
  return null;
}

export interface CompanyQuery {
  /** companyKey der Firma */
  key: string;
  /** Name, wie er angezeigt wird */
  label: string;
}

/**
 * Ergänzt den Zwischenspeicher um die Geschäftsbereiche der angegebenen Firmen.
 * Gibt null zurück, wenn nichts zu tun war. Einzelne Fehlschläge bleiben offen und werden später erneut versucht.
 */
export async function loadIndustries(fetchImpl: FetchLike, companies: CompanyQuery[], cache: IndustryCache, now = new Date()): Promise<IndustryCache | null> {
  const due = companies.filter((c) => {
    const entry = cache[c.key];
    return c.key && (!entry || (entry.industry === null && now.getTime() - Date.parse(entry.checkedAt) > RETRY_MS));
  });
  if (!due.length) return null;
  const next: IndustryCache = { ...cache };
  let changed = false;
  // Nacheinander statt parallel
  for (const c of due.slice(0, MAX_LOOKUPS)) {
    try {
      // Erst mit dem angezeigten Namen, dann mit dem bereinigten (ohne „Inc“, „AG“, „Class A“ …)
      let industry = await findIndustry(fetchImpl, c.label);
      if (!industry && c.key.toUpperCase() !== c.label.toUpperCase()) industry = await findIndustry(fetchImpl, c.key);
      next[c.key] = { industry, checkedAt: now.toISOString() };
      changed = true;
    } catch {
      // Offline oder Yahoo nicht erreichbar: beim nächsten Mal wieder versuchen
      break;
    }
  }
  return changed ? next : null;
}
