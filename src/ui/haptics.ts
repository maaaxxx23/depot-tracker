// Zentrales haptisches Feedback: ein feines Auswahl-Tick beim Bestätigen,
// abschaltbar unter „Zugang verwalten“ → „Darstellung“.

import * as Haptics from 'expo-haptics';
import { hapticsPreference } from '../data/store';

let enabled = true;
hapticsPreference
  .get()
  .then((on) => {
    enabled = on;
  })
  .catch(() => {});

/** Kurzes Tick, falls haptisches Feedback eingeschaltet ist. */
export function tapFeedback() {
  if (enabled) Haptics.selectionAsync().catch(() => {});
}

/** Doppeltes Erfolgs-Signal, z. B. nach einer abgeschlossenen Aktualisierung. */
export function successFeedback() {
  if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function setHapticsEnabled(on: boolean) {
  enabled = on;
  hapticsPreference.set(on).catch(() => {});
}
