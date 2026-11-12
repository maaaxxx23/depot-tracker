// Bestandsliste eines ETF einlesen: die Datei, die der Anbieter auf seiner Produktseite zum Download anbietet
// (z. B. iShares: „Fondspositionen“ als CSV). Rein, ohne Geräte-Zugriff, damit es testbar ist.
//
// Die Spalten werden an ihren Überschriften erkannt (deutsch oder englisch), nicht an ihrer Position.
// So funktionieren auch Listen anderer Anbieter, solange sie als CSV mit Name und Gewichtung vorliegen.

export interface FundHolding {
  name: string;
  /** Anteil am ETF (0,05 = 5 %) */
  weight: number;
  sector: string;
  country: string;
}

export interface FundComposition {
  importedAt: string;
  /** Stand laut Datei, so wie er dort steht (z. B. „09.Nov.2026“); null, wenn nicht angegeben */
  asOf: string | null;
  /** Anzahl der Positionen mit Gewicht in der Datei */
  count: number;
  /** Anteil je Branche bzw. Land am ETF */
  sectors: Record<string, number>;
  countries: Record<string, number>;
  /** Die größten Positionen, für die Liste der größten Firmen im Depot */
  top: FundHolding[];
}

/**
 * So viele Einzelpositionen je ETF werden behalten; Branchen und Länder zählen immer die ganze Liste.
 * Genug, damit die Überschneidung zwischen zwei ETFs fast vollständig gerechnet werden kann.
 */
const KEEP_TOP = 1000;
export const OTHER = 'Sonstige';
export const CASH = 'Barmittel & Derivate';

const COLUMNS = {
  name: /^(name|bezeichnung|wertpapier|wertpapiername|holding|holding name|security|security name|constituent|titel)$/i,
  weight: /^(gewichtung|gewicht|weight|weighting|anteil|% of net assets|% des fondsvermögens)\b/i,
  sector: /^(sektor|sector|branche|industry sector|gics sector)$/i,
  country: /^(standort|land|country|location|domizil|country of risk)$/i,
  assetClass: /^(anlageklasse|asset class|assetklasse)$/i,
};

/** Trennt eine CSV-Zeile; Anführungszeichen schützen Trennzeichen im Feld. */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      cells.push(cell);
      cell = '';
    } else cell += c;
  }
  cells.push(cell);
  return cells.map((s) => s.replace(/ /g, ' ').trim());
}

/** „5,74“, „5.74“, „1.234,56“ oder „5.74%“ → Zahl; NaN, wenn es keine ist. */
export function flexibleNumber(raw: string): number {
  const s = raw.replace(/[%\s]/g, '');
  if (!s || !/^-?[\d.,]+$/.test(s)) return NaN;
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  // Das letzte Trennzeichen ist das Dezimalzeichen
  const normalized = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  return Number(normalized);
}

// Englische Bezeichnungen auf die deutschen abbilden, damit sich Listen in beiden Sprachen zusammenzählen lassen
const SECTORS: Record<string, string> = {
  'information technology': 'IT',
  technology: 'IT',
  informationstechnologie: 'IT',
  financials: 'Finanzwesen',
  finanzen: 'Finanzwesen',
  'financial services': 'Finanzwesen',
  industrials: 'Industrie',
  'health care': 'Gesundheitsversorgung',
  healthcare: 'Gesundheitsversorgung',
  gesundheitswesen: 'Gesundheitsversorgung',
  gesundheit: 'Gesundheitsversorgung',
  'consumer discretionary': 'Zyklische Konsumgüter',
  'consumer cyclical': 'Zyklische Konsumgüter',
  'nicht-basiskonsumgüter': 'Zyklische Konsumgüter',
  communication: 'Kommunikation',
  'communication services': 'Kommunikation',
  kommunikationsdienste: 'Kommunikation',
  telekommunikation: 'Kommunikation',
  'consumer staples': 'Nichtzyklische Konsumgüter',
  'consumer defensive': 'Nichtzyklische Konsumgüter',
  basiskonsumgüter: 'Nichtzyklische Konsumgüter',
  energy: 'Energie',
  materials: 'Materialien',
  'basic materials': 'Materialien',
  roh: 'Materialien',
  grundstoffe: 'Materialien',
  utilities: 'Versorger',
  versorgungsbetriebe: 'Versorger',
  'real estate': 'Immobilien',
  'cash and/or derivatives': CASH,
  'cash and derivatives': CASH,
  cash: CASH,
  other: OTHER,
};

const COUNTRIES: Record<string, string> = {
  'united states': 'Vereinigte Staaten',
  usa: 'Vereinigte Staaten',
  us: 'Vereinigte Staaten',
  'united kingdom': 'Vereinigtes Königreich',
  uk: 'Vereinigtes Königreich',
  großbritannien: 'Vereinigtes Königreich',
  japan: 'Japan',
  canada: 'Kanada',
  switzerland: 'Schweiz',
  france: 'Frankreich',
  germany: 'Deutschland',
  australia: 'Australien',
  netherlands: 'Niederlande',
  spain: 'Spanien',
  sweden: 'Schweden',
  italy: 'Italien',
  denmark: 'Dänemark',
  'hong kong': 'Hongkong',
  singapore: 'Singapur',
  belgium: 'Belgien',
  finland: 'Finnland',
  norway: 'Norwegen',
  ireland: 'Irland',
  israel: 'Israel',
  austria: 'Österreich',
  portugal: 'Portugal',
  'new zealand': 'Neuseeland',
  china: 'China',
  taiwan: 'Taiwan',
  india: 'Indien',
  'korea (south)': 'Südkorea',
  'south korea': 'Südkorea',
  korea: 'Südkorea',
  brazil: 'Brasilien',
  'south africa': 'Südafrika',
  'saudi arabia': 'Saudi-Arabien',
  mexico: 'Mexiko',
  'united arab emirates': 'Vereinigte Arabische Emirate',
  indonesia: 'Indonesien',
  thailand: 'Thailand',
  malaysia: 'Malaysia',
  poland: 'Polen',
  turkey: 'Türkei',
  greece: 'Griechenland',
  'european union': 'Europäische Union',
};

const label = (raw: string | undefined, map: Record<string, string>) => {
  const value = (raw ?? '').trim();
  if (!value || value === '-' || value === '--') return OTHER;
  return map[value.toLowerCase()] ?? value;
};

/**
 * Liest eine Bestandsliste. Wirft mit verständlicher Meldung, wenn die Datei keine erkennbare Liste ist.
 */
export function parseHoldings(text: string, importedAt: string): FundComposition {
  if (text.startsWith('PK')) throw new Error('Das ist eine Excel-Datei. Bitte lade die Bestandsliste beim Anbieter als CSV herunter.');
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);

  // Kopfzeile suchen: die erste Zeile mit einer Namens- und einer Gewichtungsspalte
  let header = -1;
  let delimiter = ',';
  let cols = { name: -1, weight: -1, sector: -1, country: -1, assetClass: -1 };
  search: for (let i = 0; i < Math.min(lines.length, 40); i++) {
    for (const d of [',', ';', '\t']) {
      const cells = splitCsvLine(lines[i], d);
      const find = (pattern: RegExp) => cells.findIndex((c) => pattern.test(c));
      const found = { name: find(COLUMNS.name), weight: find(COLUMNS.weight), sector: find(COLUMNS.sector), country: find(COLUMNS.country), assetClass: find(COLUMNS.assetClass) };
      if (found.name >= 0 && found.weight >= 0) {
        header = i;
        delimiter = d;
        cols = found;
        break search;
      }
    }
  }
  if (header < 0) throw new Error('Die Datei sieht nicht wie eine Bestandsliste aus: Es fehlen Spalten für Name und Gewichtung.');
  if (cols.sector < 0 && cols.country < 0) throw new Error('Die Liste enthält weder Branchen noch Länder. Damit lässt sich nichts auswerten.');

  const stand = lines.slice(0, header).join(' ').match(/(?:per|as of|stand)[^\d]{0,12}"?(\d{1,2}[.\/ -]\s?[A-Za-zä.]{2,9}[.\/ -]\s?\d{2,4}|\d{1,2}\.\d{1,2}\.\d{2,4}|\d{4}-\d{2}-\d{2})/i);

  const holdings: FundHolding[] = [];
  for (const line of lines.slice(header + 1)) {
    if (!line.trim()) continue;
    const cells = splitCsvLine(line, delimiter);
    const weight = flexibleNumber(cells[cols.weight] ?? '');
    const name = cells[cols.name];
    if (!name || !(weight > 0)) continue;
    const cash = cols.assetClass >= 0 && /geldmarkt|money market|cash|barmittel|fx|futures|derivat/i.test(cells[cols.assetClass] ?? '');
    holdings.push({
      name,
      weight,
      sector: cash ? CASH : label(cells[cols.sector], SECTORS),
      country: cash ? OTHER : label(cells[cols.country], COUNTRIES),
    });
  }
  if (!holdings.length) throw new Error('Die Liste enthält keine Positionen mit Gewichtung.');

  // Gewichte stehen meist in Prozent (5,74), selten als Bruchteil (0,0574)
  const total = holdings.reduce((s, h) => s + h.weight, 0);
  const scale = total > 1.5 ? 1 / total : 1 / Math.max(total, 1e-9);
  const sectors: Record<string, number> = {};
  const countries: Record<string, number> = {};
  for (const h of holdings) {
    h.weight *= scale;
    sectors[h.sector] = (sectors[h.sector] ?? 0) + h.weight;
    countries[h.country] = (countries[h.country] ?? 0) + h.weight;
  }
  holdings.sort((a, b) => b.weight - a.weight);
  return { importedAt, asOf: stand ? stand[1].trim() : null, count: holdings.length, sectors, countries, top: holdings.filter((h) => h.sector !== CASH).slice(0, KEEP_TOP) };
}
