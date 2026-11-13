import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { appLockPreference } from '../data/store';
import { useStyles } from './styles';

/**
 * Legt sich über die ganze App, bis Face ID (oder ersatzweise der Geräte-Code) entsperrt hat.
 * Gesperrt wird beim Start und wenn die App aus dem Hintergrund zurückkommt; kurze
 * Unterbrechungen wie das Teilen-Menü oder die Face-ID-Abfrage selbst sperren nicht.
 */
export function AppLock({ children }: { children: React.ReactNode }) {
  const { theme } = useStyles();
  // null = Einstellung wird noch gelesen: solange nur die leere Fläche zeigen, damit nichts aufblitzt
  const [locked, setLocked] = useState<boolean | null>(null);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const authenticating = useRef(false);

  const unlock = useCallback(async () => {
    if (authenticating.current) return;
    authenticating.current = true;
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Depot Tracker entsperren' });
      if (result.success) setLocked(false);
    } catch {
      // Abbruch oder Face ID nicht verfügbar: der Entsperren-Knopf bleibt für den nächsten Versuch
    } finally {
      authenticating.current = false;
    }
  }, []);

  useEffect(() => {
    appLockPreference
      .get()
      .then((on) => {
        setLocked(on);
        if (on) unlock();
      })
      .catch(() => setLocked(false));
  }, [unlock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        appLockPreference
          .get()
          .then((on) => on && setLocked(true))
          .catch(() => {});
      } else if (state === 'active' && lockedRef.current) {
        unlock();
      }
    });
    return () => sub.remove();
  }, [unlock]);

  if (locked === false) return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      {locked && (
        <>
          <Ionicons name="lock-closed-outline" size={40} color={theme.muted} />
          <Text style={{ fontSize: 17, fontWeight: '600', color: theme.text }}>Depot Tracker ist gesperrt</Text>
          <Pressable
            onPress={unlock}
            accessibilityRole="button"
            style={({ pressed }) => ({ backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28, opacity: pressed ? 0.7 : 1 })}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Entsperren</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
