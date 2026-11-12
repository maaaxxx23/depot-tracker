import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { mergeSettings, mergeStored, parseBackup, parseBackupSettings, serializeBackup, StoredPortfolio } from './backupFormat';
import { addCsvTransactions, decodeCsv, ImportResult, knownInstrumentIds, parseComdirectCsv } from './csvImport';
import { FundComposition, parseHoldings } from './holdingsImport';
import { lastBackup, loadSettings, loadStored, replaceStored, saveSettings } from './store';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Schreibt den gespeicherten Stand in eine Datei und öffnet das iOS-Teilen-Menü
 * („In Dateien sichern“ → iCloud Drive). false, wenn es noch nichts zu sichern gibt.
 */
export async function exportBackup(): Promise<boolean> {
  const stored = await loadStored();
  if (!stored) return false;
  const now = new Date();
  const name = `depot-tracker-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(serializeBackup(stored, now.toISOString(), await loadSettings()));
  try {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Sicherung speichern' });
    // iOS meldet nicht, ob im Teilen-Menü wirklich gespeichert wurde; das Schließen des Menüs zählt als Sicherung
    await lastBackup.set(now.toISOString()).catch(() => {});
  } finally {
    // Kopie im Cache nicht liegen lassen; gesichert ist, was du im Teilen-Menü abgelegt hast
    if (file.exists) file.delete();
  }
  return true;
}

/** Lässt eine Sicherung auswählen und führt sie mit dem aktuellen Stand zusammen (Depotdaten und Einstellungen). null = abgebrochen. */
export async function importBackup(): Promise<StoredPortfolio | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (picked.canceled) return null;
  const file = new File(picked.assets[0].uri);
  const text = await file.text();
  const backup = parseBackup(text);
  const merged = mergeStored(await loadStored(), backup);
  await replaceStored(merged);
  // Ziel, Rendite und Sparplan-Markierungen: nur ergänzen, was auf dem iPhone fehlt
  await saveSettings(mergeSettings(await loadSettings(), parseBackupSettings(text))).catch(() => {});
  if (file.exists) file.delete();
  return merged;
}

/**
 * Lässt eine oder mehrere Bestandslisten auswählen (CSV vom Anbieter) und liest sie ein.
 * Bei einer einzelnen Datei wirft ein Lesefehler; bei mehreren landen unlesbare Dateien in `failed`.
 * null = abgebrochen.
 */
export async function pickHoldings(many: boolean): Promise<{ funds: FundComposition[]; failed: string[] } | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: many });
  if (picked.canceled) return null;
  const funds: FundComposition[] = [];
  const failed: string[] = [];
  const importedAt = new Date().toISOString();
  for (const asset of picked.assets) {
    const file = new File(asset.uri);
    try {
      funds.push(parseHoldings(decodeCsv(await file.bytes()), importedAt));
    } catch (e) {
      if (picked.assets.length === 1) throw e;
      failed.push(asset.name);
    } finally {
      if (file.exists) file.delete();
    }
  }
  return { funds, failed };
}

export interface CsvPreview {
  csv: ImportResult;
  added: number;
  /** Zum Übernehmen: gespeicherter Stand inklusive der neuen Umsätze */
  next: StoredPortfolio;
}

/**
 * Lässt einen CSV-Export von comdirect.de auswählen (Depotumsätze oder Kontoumsätze) und
 * berechnet, was sich ändern würde. Gespeichert wird erst mit applyCsv. null = abgebrochen.
 */
export async function pickDepotCsv(): Promise<CsvPreview | null> {
  const stored = await loadStored();
  if (!stored) throw new Error('Rufe zuerst einmal deine Daten von comdirect ab; der Import ergänzt dann die älteren Umsätze.');
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (picked.canceled) return null;
  const file = new File(picked.assets[0].uri);
  try {
    const csv = parseComdirectCsv(decodeCsv(await file.bytes()), knownInstrumentIds(stored));
    const { stored: next, added } = addCsvTransactions(stored, csv.transactions);
    return { csv, added: Math.max(0, added), next };
  } finally {
    if (file.exists) file.delete();
  }
}

export async function applyCsv(preview: CsvPreview): Promise<StoredPortfolio> {
  // Seit der Vorschau könnte ein Abruf dazugekommen sein: auf den aktuellen Stand anwenden
  const current = await loadStored();
  const next = current ? addCsvTransactions(current, preview.csv.transactions).stored : preview.next;
  await replaceStored(next);
  return next;
}

export { backupDue } from './backupFormat';
