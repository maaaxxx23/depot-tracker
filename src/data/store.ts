import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RawPortfolio, Snapshot } from '../comdirect/portfolio';
import type { VisitSnapshot } from '../finance/visit';
import type { IndustryCache } from '../market/industries';
import type { MarketData } from '../market/yahoo';
import type { WithdrawalWish } from '../finance/withdrawal';
import type { BackupLists, BackupSettings, StoredPortfolio } from './backupFormat';
import type { FundComposition } from './holdingsImport';

// Lokale Ablage auf dem iPhone (keine Zugangsdaten, die liegen im Schlüsselbund).

const KEYS = {
  raw: 'comdirect-raw-v1',
  fetchedAt: 'comdirect-fetched-at-v1',
  snapshots: 'comdirect-snapshots-v1',
  openChallenges: 'comdirect-open-challenges-v1',
  market: 'market-prices-v1',
  lastBackup: 'last-backup-v1',
  visitLast: 'visit-last-v1',
  visitBaseline: 'visit-baseline-v1',
  compositions: 'fund-compositions-v1',
  industries: 'company-industries-v1',
};

// Bleiben auch nach „Zugang löschen“ erhalten (keine Depotdaten)
const PREFERENCES = {
  chartMode: 'chart-mode-v1',
  goal: 'goal-v1',
  assumedReturn: 'assumed-return-v1',
  savingsMarks: 'savings-marks-v1',
  targetShares: 'target-shares-v1',
  withdrawal: 'withdrawal-v1',
  appLock: 'app-lock-v1',
  autoLock: 'auto-lock-minutes-v1',
  appearance: 'appearance-v1',
  haptics: 'haptics-v1',
  welcome: 'welcome-seen-v1',
  monthReview: 'month-review-v1',
  monthReviewDismissed: 'month-review-dismissed-v1',
  monthReviewCollapsed: 'month-review-collapsed-v1',
};

const MAX_SNAPSHOTS = 2000;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export type { StoredPortfolio };

/** Ersetzt den gespeicherten Stand komplett, z. B. nach dem Einlesen einer Sicherung. */
export async function replaceStored(stored: StoredPortfolio): Promise<void> {
  await AsyncStorage.multiSet([
    [KEYS.raw, JSON.stringify(stored.raw)],
    [KEYS.fetchedAt, JSON.stringify(stored.fetchedAt)],
    [KEYS.snapshots, JSON.stringify(stored.snapshots.slice(-MAX_SNAPSHOTS))],
  ]);
}

export async function loadStored(): Promise<StoredPortfolio | null> {
  const [raw, fetchedAt, snapshots] = await Promise.all([
    readJson<RawPortfolio | null>(KEYS.raw, null),
    readJson<string | null>(KEYS.fetchedAt, null),
    readJson<Snapshot[]>(KEYS.snapshots, []),
  ]);
  return raw && fetchedAt ? { raw, fetchedAt, snapshots } : null;
}

/** Speichert den neuen Abruf; pro Tag bleibt der jeweils letzte Kurs-Snapshot. */
export async function saveFetch(raw: RawPortfolio, fetchedAt: string, snapshot: Snapshot): Promise<Snapshot[]> {
  const previous = await readJson<Snapshot[]>(KEYS.snapshots, []);
  const snapshots = [...previous.filter((s) => s.date !== snapshot.date), snapshot].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_SNAPSHOTS);
  await AsyncStorage.multiSet([
    [KEYS.raw, JSON.stringify(raw)],
    [KEYS.fetchedAt, JSON.stringify(fetchedAt)],
    [KEYS.snapshots, JSON.stringify(snapshots)],
  ]);
  return snapshots;
}

/** Zwischenspeicher der Kurshistorie, damit die App sie nicht bei jedem Start neu lädt. */
export const marketCache = {
  get: () => readJson<MarketData | null>(KEYS.market, null),
  set: (market: MarketData) => AsyncStorage.setItem(KEYS.market, JSON.stringify(market)),
};

/** Bestand und Kurse am Ende des letzten Besuchs (last) und Vergleichsbasis des laufenden Besuchs (baseline). */
export const visitStore = {
  getLast: () => readJson<VisitSnapshot | null>(KEYS.visitLast, null),
  setLast: (s: VisitSnapshot) => AsyncStorage.setItem(KEYS.visitLast, JSON.stringify(s)),
  getBaseline: () => readJson<VisitSnapshot | null>(KEYS.visitBaseline, null),
  setBaseline: (s: VisitSnapshot) => AsyncStorage.setItem(KEYS.visitBaseline, JSON.stringify(s)),
};

/** Importierte Bestandslisten der ETFs je ISIN (Länder, Branchen, größte Firmen). */
export const compositionStore = {
  get: () => readJson<Record<string, FundComposition>>(KEYS.compositions, {}),
  set: (all: Record<string, FundComposition>) => AsyncStorage.setItem(KEYS.compositions, JSON.stringify(all)),
};

/** Geschäftsbereiche der größten Firmen (von Yahoo), damit sie nicht jedes Mal neu gesucht werden. */
export const industryStore = {
  get: () => readJson<IndustryCache>(KEYS.industries, {}),
  set: (cache: IndustryCache) => AsyncStorage.setItem(KEYS.industries, JSON.stringify(cache)),
};

/** Zeitpunkt der letzten Sicherung (ISO), null = noch nie gesichert. */
export const lastBackup = {
  get: () => readJson<string | null>(KEYS.lastBackup, null),
  set: (iso: string) => AsyncStorage.setItem(KEYS.lastBackup, JSON.stringify(iso)),
};

/** Zuletzt gewählte Chart-Ansicht (Euro oder Prozent). */
export const chartModePreference = {
  get: () => readJson<'value' | 'return'>(PREFERENCES.chartMode, 'value'),
  set: (mode: 'value' | 'return') => AsyncStorage.setItem(PREFERENCES.chartMode, JSON.stringify(mode)),
};

/** Wunschbetrag für das Depot in Euro; null = keiner festgelegt. */
export const goalPreference = {
  get: () => readJson<number | null>(PREFERENCES.goal, null),
  set: (goal: number | null) => (goal === null ? AsyncStorage.removeItem(PREFERENCES.goal) : AsyncStorage.setItem(PREFERENCES.goal, JSON.stringify(goal))),
};

/** Angenommene Rendite pro Jahr für die Hochrechnung zum Ziel; null = Vorgabe. */
export const assumedReturnPreference = {
  get: () => readJson<number | null>(PREFERENCES.assumedReturn, null),
  set: (rate: number) => AsyncStorage.setItem(PREFERENCES.assumedReturn, JSON.stringify(rate)),
};

/** ISINs, die du selbst als Sparplan markiert hast. */
export const savingsMarks = {
  get: () => readJson<string[]>(PREFERENCES.savingsMarks, []),
  set: (isins: string[]) => AsyncStorage.setItem(PREFERENCES.savingsMarks, JSON.stringify(isins)),
};

/** Zielaufteilung: Wunschanteil je ISIN; leer = keine. */
export const targetSharesPreference = {
  get: () => readJson<Record<string, number>>(PREFERENCES.targetShares, {}),
  set: (shares: Record<string, number>) => AsyncStorage.setItem(PREFERENCES.targetShares, JSON.stringify(shares)),
};

/** Wunsch-Entnahme für die Modellrechnung; null = keine festgelegt. */
export const withdrawalPreference = {
  get: () => readJson<WithdrawalWish | null>(PREFERENCES.withdrawal, null),
  set: (wish: WithdrawalWish | null) => (wish === null ? AsyncStorage.removeItem(PREFERENCES.withdrawal) : AsyncStorage.setItem(PREFERENCES.withdrawal, JSON.stringify(wish))),
};

/** App-Sperre: beim Öffnen mit Face ID bzw. Geräte-Code entsperren. Bewusst gerätespezifisch, kommt nicht in die Sicherung. */
export const appLockPreference = {
  get: () => readJson<boolean>(PREFERENCES.appLock, false),
  set: (on: boolean) => AsyncStorage.setItem(PREFERENCES.appLock, JSON.stringify(on)),
};

/** Wurde die Willkommens-Tour beim ersten Start schon gezeigt? */
export const welcomeSeen = {
  get: () => readJson<boolean>(PREFERENCES.welcome, false),
  set: (seen: boolean) => AsyncStorage.setItem(PREFERENCES.welcome, JSON.stringify(seen)),
};

/** Haptisches Feedback beim Bestätigen; standardmäßig an. */
export const hapticsPreference = {
  get: () => readJson<boolean>(PREFERENCES.haptics, true),
  set: (on: boolean) => AsyncStorage.setItem(PREFERENCES.haptics, JSON.stringify(on)),
};

/** Monats-Rückblick zu Monatsbeginn zeigen; standardmäßig an. */
export const monthReviewPreference = {
  get: () => readJson<boolean>(PREFERENCES.monthReview, true),
  set: (on: boolean) => AsyncStorage.setItem(PREFERENCES.monthReview, JSON.stringify(on)),
};

/** Monat (YYYY-MM), dessen Rückblick auf der Karte ausgeblendet wurde; der nächste erscheint wieder. */
export const monthReviewDismissed = {
  get: () => readJson<string | null>(PREFERENCES.monthReviewDismissed, null),
  set: (month: string | null) => AsyncStorage.setItem(PREFERENCES.monthReviewDismissed, JSON.stringify(month)),
};

/** Monat (YYYY-MM), dessen Rückblick auf eine Zeile eingeklappt wurde; mit + wieder aufklappbar. */
export const monthReviewCollapsed = {
  get: () => readJson<string | null>(PREFERENCES.monthReviewCollapsed, null),
  set: (month: string | null) => AsyncStorage.setItem(PREFERENCES.monthReviewCollapsed, JSON.stringify(month)),
};

/** Darstellung: dem System folgen oder fest hell bzw. dunkel. */
export type AppearanceMode = 'system' | 'light' | 'dark';

export const appearancePreference = {
  get: () => readJson<AppearanceMode>(PREFERENCES.appearance, 'system'),
  set: (mode: AppearanceMode) => AsyncStorage.setItem(PREFERENCES.appearance, JSON.stringify(mode)),
};

/** Automatische Sperre, wenn die App so viele Minuten nicht berührt wird; 0 = aus. Gerätespezifisch wie die App-Sperre. */
export const autoLockPreference = {
  get: () => readJson<number>(PREFERENCES.autoLock, 0),
  set: (minutes: number) => AsyncStorage.setItem(PREFERENCES.autoLock, JSON.stringify(minutes)),
};

/** ETF-Listen und Branchen-Zwischenspeicher auf einmal, für Sichern und Wiederherstellen. */
export async function loadLists(): Promise<BackupLists> {
  const [compositions, industries] = await Promise.all([compositionStore.get(), industryStore.get()]);
  return { compositions, industries };
}

export async function saveLists(lists: BackupLists): Promise<void> {
  await compositionStore.set(lists.compositions);
  await industryStore.set(lists.industries);
}

/** Alle persönlichen Einstellungen auf einmal, für Sichern und Wiederherstellen. */
export async function loadSettings(): Promise<BackupSettings> {
  const [goal, assumedReturn, marks, targetShares, withdrawal] = await Promise.all([
    goalPreference.get(),
    assumedReturnPreference.get(),
    savingsMarks.get(),
    targetSharesPreference.get(),
    withdrawalPreference.get(),
  ]);
  return { goal, assumedReturn, savingsMarks: marks, targetShares, withdrawal };
}

export async function saveSettings(settings: BackupSettings): Promise<void> {
  await goalPreference.set(settings.goal);
  if (settings.assumedReturn !== null) await assumedReturnPreference.set(settings.assumedReturn);
  await savingsMarks.set(settings.savingsMarks);
  await targetSharesPreference.set(settings.targetShares);
  await withdrawalPreference.set(settings.withdrawal);
}

export async function clearStored(): Promise<void> {
  await AsyncStorage.multiRemove(Object.values(KEYS));
}

/**
 * Zählt TAN-Anfragen ohne erfolgreiche Freigabe. comdirect sperrt nach fünf davon,
 * deshalb warnt die App früh und blockiert vor der fünften.
 */
export const openChallenges = {
  get: () => readJson<number>(KEYS.openChallenges, 0),
  increment: async () => {
    const next = (await openChallenges.get()) + 1;
    await AsyncStorage.setItem(KEYS.openChallenges, JSON.stringify(next));
    return next;
  },
  reset: () => AsyncStorage.setItem(KEYS.openChallenges, '0'),
};
