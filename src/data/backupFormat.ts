// Format der Sicherungsdatei (rein, ohne Geräte-Zugriff, damit es testbar ist).
// Enthält Depotdaten und deine Einstellungen (Ziel, Rendite, Sparplan-Markierungen),
// aber nie Zugangsdaten: die bleiben im Schlüsselbund.

import { mergeTransactions, RawPortfolio, Snapshot } from '../comdirect/portfolio';

export interface StoredPortfolio {
  raw: RawPortfolio;
  fetchedAt: string;
  snapshots: Snapshot[];
}

const APP = 'depot-tracker';
const VERSION = 1;

/** Persönliche Einstellungen, die mit in die Sicherung kommen. null bzw. leer = nicht gesetzt. */
export interface BackupSettings {
  /** Wunschbetrag für das Depot in Euro */
  goal: number | null;
  /** Angenommene Rendite pro Jahr für die Hochrechnung */
  assumedReturn: number | null;
  /** ISINs, die als Sparplan markiert sind */
  savingsMarks: string[];
  /** Zielaufteilung: Wunschanteil je ISIN (0,7 = 70 %); leer = keine */
  targetShares: Record<string, number>;
}

export const NO_SETTINGS: BackupSettings = { goal: null, assumedReturn: null, savingsMarks: [], targetShares: {} };

interface BackupFile extends StoredPortfolio {
  app: typeof APP;
  version: number;
  exportedAt: string;
  /** Fehlt in Sicherungen aus älteren App-Ständen */
  settings?: Partial<BackupSettings>;
}

export function serializeBackup(stored: StoredPortfolio, exportedAt: string, settings?: BackupSettings): string {
  const file: BackupFile = { app: APP, version: VERSION, exportedAt, ...stored, ...(settings ? { settings } : {}) };
  return JSON.stringify(file);
}

/** Einstellungen aus einer Sicherung; unbekannte oder unsinnige Werte gelten als nicht gesetzt. */
export function parseBackupSettings(text: string): BackupSettings {
  let settings: Partial<BackupSettings> | undefined;
  try {
    settings = (JSON.parse(text) as Partial<BackupFile>)?.settings;
  } catch {
    return NO_SETTINGS;
  }
  if (!settings || typeof settings !== 'object') return NO_SETTINGS;
  const { goal, assumedReturn, savingsMarks, targetShares } = settings;
  const shares = targetShares && typeof targetShares === 'object' ? Object.entries(targetShares).filter(([, v]) => typeof v === 'number' && v >= 0 && v <= 1) : [];
  return {
    goal: typeof goal === 'number' && Number.isFinite(goal) && goal > 0 ? goal : null,
    assumedReturn: typeof assumedReturn === 'number' && assumedReturn >= 0 && assumedReturn <= 1 ? assumedReturn : null,
    savingsMarks: Array.isArray(savingsMarks) ? savingsMarks.filter((m): m is string => typeof m === 'string') : [],
    targetShares: Object.fromEntries(shares),
  };
}

/**
 * Wie bei den Depotdaten überschreibt das Wiederherstellen nichts: Was auf dem iPhone schon
 * eingestellt ist, bleibt; die Sicherung füllt nur, was fehlt. Markierungen werden vereint.
 */
export function mergeSettings(current: BackupSettings, backup: BackupSettings): BackupSettings {
  return {
    goal: current.goal ?? backup.goal,
    assumedReturn: current.assumedReturn ?? backup.assumedReturn,
    savingsMarks: [...new Set([...current.savingsMarks, ...backup.savingsMarks])],
    // Eine Aufteilung gehört zusammen (100 %): entweder die vom iPhone oder die aus der Sicherung, nie gemischt
    targetShares: Object.keys(current.targetShares).length ? current.targetShares : backup.targetShares,
  };
}

/** Liest eine Sicherung; wirft mit verständlicher Meldung, wenn die Datei nicht passt. */
export function parseBackup(text: string): StoredPortfolio {
  let file: Partial<BackupFile>;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist keine Sicherung dieser App.');
  }
  if (file?.app !== APP) throw new Error('Die Datei ist keine Sicherung dieser App.');
  if (typeof file.version !== 'number' || file.version > VERSION) throw new Error('Die Sicherung stammt aus einer neueren App-Version.');
  if (!file.raw || !Array.isArray(file.raw.positions) || !Array.isArray(file.raw.transactions) || typeof file.fetchedAt !== 'string') {
    throw new Error('Die Sicherung ist unvollständig.');
  }
  return { raw: file.raw, fetchedAt: file.fetchedAt, snapshots: Array.isArray(file.snapshots) ? file.snapshots : [] };
}

/**
 * Führt eine Sicherung mit dem aktuellen Stand zusammen, statt ihn zu ersetzen: Umsätze und
 * Kurs-Snapshots aus beiden bleiben, Bestand und Stand kommen vom neueren Abruf.
 */
export function mergeStored(current: StoredPortfolio | null, backup: StoredPortfolio): StoredPortfolio {
  if (!current) return backup;
  const newer = backup.fetchedAt > current.fetchedAt ? backup : current;
  const older = newer === backup ? current : backup;
  const snapshots = new Map<string, Snapshot>();
  for (const s of [...older.snapshots, ...newer.snapshots]) snapshots.set(s.date, s);
  return {
    raw: { positions: newer.raw.positions, transactions: mergeTransactions(older.raw.transactions, newer.raw.transactions) },
    fetchedAt: newer.fetchedAt,
    snapshots: [...snapshots.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

const REMIND_AFTER_DAYS = 28;

/** true, wenn noch nie oder vor mehr als vier Wochen gesichert wurde. */
export function backupDue(last: string | null, now = new Date()): boolean {
  if (!last) return true;
  return now.getTime() - new Date(last).getTime() > REMIND_AFTER_DAYS * 24 * 60 * 60 * 1000;
}
