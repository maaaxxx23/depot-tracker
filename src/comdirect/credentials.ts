import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import type { Credentials } from './login';

// Alles liegt im iOS-Schlüsselbund, nur auf diesem Gerät und nur bei entsperrtem iPhone.
// Die PIN wird zusätzlich nur nach Face ID (oder iPhone-Code) herausgegeben.

const KEYS = {
  clientId: 'comdirect.clientId',
  clientSecret: 'comdirect.clientSecret',
  username: 'comdirect.username',
  pin: 'comdirect.pin',
} as const;

const PROMPT = 'PIN für comdirect freigeben';
const BASE: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

// Expo Go fehlt die Face-ID-Berechtigung, die der Schlüsselbund für requireAuthentication braucht.
// Dort sperrt die App die PIN selbst (Face ID bzw. iPhone-Code vor jedem Lesen). In einer
// eigenen App-Version übernimmt das der Schlüsselbund, was strenger ist.
const IN_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const PIN_OPTIONS: SecureStore.SecureStoreOptions = IN_EXPO_GO
  ? BASE
  : { ...BASE, requireAuthentication: true, authenticationPrompt: PROMPT };

export type Setup = Omit<Credentials, 'pin'>;

export async function loadSetup(): Promise<Setup | null> {
  const [clientId, clientSecret, username] = await Promise.all([
    SecureStore.getItemAsync(KEYS.clientId, BASE),
    SecureStore.getItemAsync(KEYS.clientSecret, BASE),
    SecureStore.getItemAsync(KEYS.username, BASE),
  ]);
  return clientId && clientSecret && username ? { clientId, clientSecret, username } : null;
}

/** Speichert die Zugangsdaten; eine leere PIN lässt die gespeicherte unverändert. */
export async function saveCredentials(setup: Setup, pin: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.clientId, setup.clientId.trim(), BASE);
  await SecureStore.setItemAsync(KEYS.clientSecret, setup.clientSecret.trim(), BASE);
  await SecureStore.setItemAsync(KEYS.username, setup.username.trim(), BASE);
  if (pin) {
    // Alten Eintrag zuerst entfernen, falls er mit anderen Schutz-Optionen angelegt wurde
    await SecureStore.deleteItemAsync(KEYS.pin, PIN_OPTIONS).catch(() => {});
    await SecureStore.setItemAsync(KEYS.pin, pin, PIN_OPTIONS);
  }
}

/** Fragt Face ID ab und liefert die PIN; null, wenn keine gespeichert ist oder abgebrochen wurde. */
export async function loadPin(): Promise<string | null> {
  try {
    if (IN_EXPO_GO) {
      const auth = await LocalAuthentication.authenticateAsync({ promptMessage: PROMPT, cancelLabel: 'Abbrechen' });
      if (!auth.success) return null;
    }
    return await SecureStore.getItemAsync(KEYS.pin, PIN_OPTIONS);
  } catch {
    return null;
  }
}

export async function clearCredentials(): Promise<void> {
  await Promise.all(Object.values(KEYS).map((key) => SecureStore.deleteItemAsync(key, BASE)));
}
