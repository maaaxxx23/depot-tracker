// Welche Bestandsliste gehört zu welchem ETF?
// Die Dateien der Anbieter nennen den ETF nicht. Die App vergleicht deshalb, was der Name des ETF
// verspricht (z. B. „Emerging Markets“, „S&P 500“), mit dem Inhalt der Liste (Länder, Branchen, Anzahl).
// Das ist ein Vorschlag, keine Gewissheit: Du bestätigst die Zuordnung vor dem Übernehmen.

import type { FundComposition } from '../data/holdingsImport';

const share = (map: Record<string, number>, labels: string[]) => labels.reduce((s, l) => s + (map[l] ?? 0), 0);

const EUROPE = [
  'Vereinigtes Königreich', 'Schweiz', 'Frankreich', 'Deutschland', 'Niederlande', 'Spanien', 'Schweden', 'Italien', 'Dänemark',
  'Belgien', 'Finnland', 'Norwegen', 'Irland', 'Österreich', 'Portugal', 'Polen', 'Griechenland', 'Luxemburg',
];
const EMERGING = [
  'China', 'Taiwan', 'Indien', 'Südkorea', 'Brasilien', 'Saudi-Arabien', 'Südafrika', 'Mexiko', 'Vereinigte Arabische Emirate',
  'Indonesien', 'Thailand', 'Malaysia', 'Türkei', 'Polen', 'Griechenland', 'Katar', 'Kuwait', 'Philippinen', 'Chile',
];
const PACIFIC = ['Japan', 'Australien', 'Hongkong', 'Singapur', 'Neuseeland'];

/** 1 innerhalb von [low, high], fällt außerhalb linear auf 0 (über die Breite `fade`). */
const within = (value: number, low: number, high: number, fade = 0.25) =>
  value < low ? Math.max(0, 1 - (low - value) / fade) : value > high ? Math.max(0, 1 - (value - high) / fade) : 1;

interface Rule {
  pattern: RegExp;
  /** Wie gut die Liste zu dem passt, was der Name verspricht (0 bis 1) */
  fit: (fund: FundComposition) => number;
}

const usa = (f: FundComposition) => f.countries['Vereinigte Staaten'] ?? 0;
const sector = (label: string, min: number) => (f: FundComposition) => within(f.sectors[label] ?? 0, min, 1);

// Erste passende Regel je Gruppe zählt; Gruppen: Region, Branche
const REGIONS: Rule[] = [
  { pattern: /emerg|schwellenl|\bEM\b|em\.?\s?m(ar)?kts?|e\.m\./i, fit: (f) => within(share(f.countries, EMERGING), 0.6, 1) },
  { pattern: /all[- ]?world|acwi|\bglobal\b|weltweit/i, fit: (f) => Math.min(within(usa(f), 0.45, 0.72), within(share(f.countries, EMERGING), 0.04, 0.25, 0.08)) },
  { pattern: /\bworld\b|\bwld\b|\bwelt\b|developed/i, fit: (f) => Math.min(within(usa(f), 0.5, 0.8), within(share(f.countries, EMERGING), 0, 0.03, 0.06)) },
  { pattern: /s\s?[&+]\s?p|nasdaq|nasd\.|\busa\b|\bus\b|dow jones|russell|north america|nordamerika/i, fit: (f) => within(usa(f), 0.9, 1) },
  { pattern: /\bdax\b|mdax|sdax|germany|deutschland/i, fit: (f) => within(f.countries.Deutschland ?? 0, 0.8, 1) },
  { pattern: /japan|nikkei|topix/i, fit: (f) => within(f.countries.Japan ?? 0, 0.8, 1) },
  { pattern: /pacific|pazifik/i, fit: (f) => within(share(f.countries, PACIFIC), 0.7, 1) },
  { pattern: /europ|stoxx|\bstx\b|st\.\s?eur|eurozone|\bemu\b/i, fit: (f) => within(share(f.countries, EUROPE), 0.8, 1) },
  { pattern: /\bchina\b/i, fit: (f) => within(f.countries.China ?? 0, 0.7, 1) },
  { pattern: /\bindia\b|indien/i, fit: (f) => within(f.countries.Indien ?? 0, 0.8, 1) },
];
const SECTORS: Rule[] = [
  { pattern: /information technology|\btech|digital|software|semiconductor|halbleiter/i, fit: sector('IT', 0.5) },
  { pattern: /health|gesundheit|pharma|biotech/i, fit: sector('Gesundheitsversorgung', 0.6) },
  { pattern: /financ|finanz|\bbanks?\b|banken/i, fit: sector('Finanzwesen', 0.6) },
  { pattern: /\benergy\b|energie|\boil\b/i, fit: sector('Energie', 0.5) },
  { pattern: /real estate|immobilien|reit/i, fit: sector('Immobilien', 0.6) },
  { pattern: /utilit|versorger/i, fit: sector('Versorger', 0.6) },
];

/** Zahlen im Namen, die für die Anzahl der Firmen stehen („S&P 500“, „STOXX Europe 600“, „DAX 40“). */
const COUNT_HINT = /\b(30|40|50|100|500|600)\b/;

/**
 * Wie gut eine Liste zu einem ETF-Namen passt: 0 (passt nicht) bis 1 (passt).
 * null, wenn der Name nichts verrät, woran sich die Liste prüfen ließe.
 */
export function matchScore(name: string, fund: FundComposition): number | null {
  const scores: number[] = [];
  const region = REGIONS.find((r) => r.pattern.test(name));
  if (region) scores.push(region.fit(fund));
  const branch = SECTORS.find((r) => r.pattern.test(name));
  if (branch) scores.push(branch.fit(fund));
  const hint = name.match(COUNT_HINT);
  if (hint) {
    const expected = Number(hint[1]);
    scores.push(Math.max(0, 1 - Math.abs(fund.count - expected) / expected));
  }
  if (!scores.length) return null;
  // Das schwächste Merkmal entscheidet: Ein „S&P 500“ mit 1.200 Firmen passt nicht, auch wenn die USA stimmen
  return Math.min(...scores);
}

export interface MatchCandidate {
  isin: string;
  name: string;
}

export interface Assignment {
  /** Index der Liste in der Eingabe */
  file: number;
  /** Zugeordneter ETF; null = kein passender gefunden */
  isin: string | null;
  /** true, wenn die Zuordnung eindeutig ist; sonst nur ein Vorschlag */
  confident: boolean;
}

const GOOD = 0.75;
const MARGIN = 0.2;
const NEUTRAL = 0.5;

/**
 * Ordnet mehrere Listen den ETFs zu: jede Liste höchstens einem ETF, jeder ETF höchstens einer Liste.
 * Gesucht wird die Verteilung mit der besten Gesamtpassung.
 */
export function assignHoldings(funds: FundComposition[], candidates: MatchCandidate[]): Assignment[] {
  const score = funds.map((fund) => candidates.map((c) => matchScore(c.name, fund) ?? NEUTRAL));
  let best: (number | null)[] = funds.map(() => null);
  let bestTotal = -1;
  const current: (number | null)[] = funds.map(() => null);
  const used = new Set<number>();
  const search = (file: number, total: number) => {
    if (file === funds.length) {
      if (total > bestTotal) {
        bestTotal = total;
        best = [...current];
      }
      return;
    }
    for (let c = 0; c < candidates.length; c++) {
      if (used.has(c)) continue;
      used.add(c);
      current[file] = c;
      search(file + 1, total + score[file][c]);
      used.delete(c);
    }
    // Liste bleibt ohne ETF (z. B. mehr Listen als ETFs)
    current[file] = null;
    search(file + 1, total);
  };
  // Bei sehr vielen Dateien wäre die vollständige Suche zu langsam: dann der Reihe nach die jeweils beste freie Wahl
  if (funds.length <= 7 && candidates.length <= 8) search(0, 0);
  else {
    funds.forEach((_, file) => {
      let pick: number | null = null;
      candidates.forEach((__, c) => {
        if (!used.has(c) && (pick === null || score[file][c] > score[file][pick])) pick = c;
      });
      if (pick !== null) used.add(pick);
      best[file] = pick;
    });
  }

  return best.map((c, file) => {
    if (c === null) return { file, isin: null, confident: false };
    const own = score[file][c];
    const rival = Math.max(-1, ...score[file].filter((_, k) => k !== c));
    // Eindeutig: passt gut und deutlich besser als zu jedem anderen ETF; bei nur einem ETF reicht „passt gut“
    return { file, isin: candidates[c].isin, confident: own >= GOOD && own - rival >= MARGIN };
  });
}

/** Kurzbeschreibung einer Liste zum Wiedererkennen: „1.215 Firmen · Vereinigte Staaten 72 %, Japan 6 % · größte: Apple“. */
export function describeFund(fund: FundComposition, displayName: (name: string) => string): string {
  const countries = Object.entries(fund.countries)
    .filter(([label]) => label !== 'Sonstige')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([label, weight]) => `${label} ${Math.round(weight * 100)} %`)
    .join(', ');
  const largest = fund.top[0] ? ` · größte: ${displayName(fund.top[0].name)}` : '';
  return `${fund.count.toLocaleString('de-DE')} Positionen${countries ? ` · ${countries}` : ''}${largest}`;
}
