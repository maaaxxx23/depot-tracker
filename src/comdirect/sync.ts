import { loadStored, openChallenges, saveFetch, StoredPortfolio } from '../data/store';
import { ComdirectApi, ComdirectError } from './api';
import { ComdirectLogin, Credentials } from './login';
import { fetchRawPortfolio, mergeTransactions, snapshotOf } from './portfolio';

/** Eine Session-Id pro App-Start, wie von comdirect verlangt. */
export const comdirectApi = new ComdirectApi();

/** Ab so vielen TAN-Anfragen ohne Freigabe wird gewarnt; vor der fünften (Sperre) blockiert. */
export const WARN_OPEN_CHALLENGES = 2;
export const MAX_OPEN_CHALLENGES = 4;

export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Startet die Anmeldung und zählt die angeforderte TAN-Challenge mit. */
export async function beginLogin(credentials: Credentials, api = comdirectApi) {
  if ((await openChallenges.get()) >= MAX_OPEN_CHALLENGES) {
    throw new ComdirectError(
      'Es gab schon mehrere TAN-Anfragen ohne Freigabe. Bei fünf sperrt comdirect den Zugang. Melde dich bitte einmal auf comdirect.de mit TAN an, dann ist der Zähler zurückgesetzt.',
    );
  }
  const login = new ComdirectLogin(api, credentials);
  const challenge = await login.start();
  await openChallenges.increment();
  return { login, challenge };
}

/** Schließt die Anmeldung ab, holt alle Daten und macht den Token sofort wieder ungültig. */
export async function finishLogin(login: ComdirectLogin, tan: string | undefined, api = comdirectApi): Promise<StoredPortfolio> {
  const token = await login.complete(tan);
  await openChallenges.reset();
  try {
    const fresh = await fetchRawPortfolio(api, token.accessToken);
    // Ältere Umsätze aus früheren Abrufen behalten, comdirect liefert nur ein begrenztes Zeitfenster
    const stored = await loadStored();
    const raw = { ...fresh, transactions: mergeTransactions(stored?.raw.transactions ?? [], fresh.transactions) };
    const fetchedAt = new Date().toISOString();
    const snapshots = await saveFetch(raw, fetchedAt, snapshotOf(raw, localDate(new Date(fetchedAt))));
    return { raw, fetchedAt, snapshots };
  } finally {
    await api.revoke(token.accessToken).catch(() => {});
  }
}
