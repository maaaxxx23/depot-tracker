// „Was steckt drin“: Länder, Branchen und größte Firmen über das ganze Depot,
// gerechnet aus den Bestandslisten der ETFs und dem Gewicht jeder Position.

import type { FundComposition } from '../data/holdingsImport';
import type { PositionResult } from './performance';

export interface Slice {
  label: string;
  /** Anteil am gesamten Depot */
  weight: number;
}

export interface CompanySlice extends Slice {
  /** Schlüssel der Firma (companyKey), z. B. für den Geschäftsbereich */
  key: string;
  sector: string;
  country: string;
  /** In wie vielen deiner Wertpapiere die Firma steckt */
  sources: number;
}

export interface CompositionResult {
  /** Anteil des Depots, für den eine Bestandsliste vorliegt */
  covered: number;
  countries: Slice[];
  sectors: Slice[];
  companies: CompanySlice[];
  /** Positionen ohne Bestandsliste (ETFs ohne Import und Einzelaktien) */
  missing: PositionResult[];
}

const MAX_COMPANIES = 25;
export const UNKNOWN = 'unbekannt';

/** Schreibweisen derselben Firma zusammenführen: „ALPHABET CLASS A“ und „Alphabet Inc Class C“ → „ALPHABET“. */
export function companyKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/[.,]/g, ' ')
    .replace(/\b(CLASS|CL|SERIES)\s+[A-Z]\b/g, ' ')
    .replace(/\b(INC|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|PLC|AG|SE|SA|NV|ORDINARY SHARES|ORD|ADR|REG|N)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** „APPLE“ → „Apple“, „AMAZON.COM INC“ → „Amazon.com Inc“; gemischte Schreibweise bleibt. */
export function displayName(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s&-])([a-zäöü])/g, (_, lead: string, c: string) => lead + c.toUpperCase());
}

const sorted = (map: Map<string, number>): Slice[] => [...map.entries()].map(([label, weight]) => ({ label, weight })).sort((a, b) => b.weight - a.weight);

export function analyzeComposition(positions: PositionResult[], compositions: Record<string, FundComposition>): CompositionResult {
  const countries = new Map<string, number>();
  const sectors = new Map<string, number>();
  const companies = new Map<string, CompanySlice>();
  const missing: PositionResult[] = [];
  let covered = 0;

  for (const p of positions) {
    const fund = compositions[p.instrument.isin];
    if (!fund) {
      missing.push(p);
      continue;
    }
    covered += p.share;
    for (const [label, weight] of Object.entries(fund.countries)) countries.set(label, (countries.get(label) ?? 0) + weight * p.share);
    for (const [label, weight] of Object.entries(fund.sectors)) sectors.set(label, (sectors.get(label) ?? 0) + weight * p.share);
    const seen = new Set<string>();
    for (const h of fund.top) {
      const key = companyKey(h.name);
      if (!key) continue;
      const entry = companies.get(key) ?? { key, label: displayName(h.name).replace(/\s+Class\s+[A-Z]$/i, ''), weight: 0, sector: h.sector, country: h.country, sources: 0 };
      entry.weight += h.weight * p.share;
      if (!seen.has(key)) entry.sources++;
      seen.add(key);
      companies.set(key, entry);
    }
  }

  // Einzelaktien zählen als eigene Firma. Steckt dieselbe Firma auch in einem ETF,
  // sind Land und Branche von dort bekannt und die Aktie gilt als ausgewertet.
  for (const p of [...missing]) {
    if (p.instrument.kind !== 'Aktie') continue;
    const key = companyKey(p.instrument.name) || companyKey(p.instrument.shortName);
    const known = companies.get(key);
    if (known) {
      known.weight += p.share;
      known.sources++;
      covered += p.share;
      countries.set(known.country, (countries.get(known.country) ?? 0) + p.share);
      sectors.set(known.sector, (sectors.get(known.sector) ?? 0) + p.share);
      missing.splice(missing.indexOf(p), 1);
    } else {
      companies.set(key || p.instrument.isin, { key: key || p.instrument.isin, label: p.instrument.shortName, weight: p.share, sector: UNKNOWN, country: UNKNOWN, sources: 1 });
    }
  }

  return {
    covered,
    countries: sorted(countries),
    sectors: sorted(sectors),
    companies: [...companies.values()].sort((a, b) => b.weight - a.weight).slice(0, MAX_COMPANIES),
    missing,
  };
}
