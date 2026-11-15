import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Image, Pressable, Text, View } from 'react-native';
import { appLockPreference, autoLockPreference } from '../data/store';
import { useStyles } from './styles';

/** So oft prüft die App, ob die Auto-Sperre fällig ist. */
const AUTO_LOCK_CHECK_MS = 10000;

/**
 * Legt sich über die ganze App, bis Face ID (oder ersatzweise der Geräte-Code) entsperrt hat.
 * Gesperrt wird beim Start, wenn die App aus dem Hintergrund zurückkommt und – falls
 * eingestellt – nach einigen Minuten ohne Berührung. Kurze Unterbrechungen wie das
 * Teilen-Menü oder die Face-ID-Abfrage selbst sperren nicht.
 *
 * Sobald die App nicht im Vordergrund ist (App-Wechsler, andere App), deckt ein schwarzer
 * Vorhang mit dem App-Symbol den Inhalt ab, damit die iOS-Vorschau nichts verrät.
 */
export function AppLock({ children }: { children: React.ReactNode }) {
  const { theme } = useStyles();
  // null = Einstellung wird noch gelesen: solange nur die leere Fläche zeigen, damit nichts aufblitzt
  const [locked, setLocked] = useState<boolean | null>(null);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const authenticating = useRef(false);
  // Vorhang, solange die App nicht aktiv im Vordergrund ist (auch in der Multitasking-Ansicht)
  const [covered, setCovered] = useState(AppState.currentState !== 'active');
  const lastTouch = useRef(Date.now());

  const unlock = useCallback(async () => {
    if (authenticating.current) return;
    authenticating.current = true;
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Depot Tracker entsperren' });
      if (result.success) {
        lastTouch.current = Date.now();
        setLocked(false);
      }
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
      setCovered(state !== 'active');
      if (state === 'background') {
        appLockPreference
          .get()
          .then((on) => on && setLocked(true))
          .catch(() => {});
      } else if (state === 'active') {
        lastTouch.current = Date.now();
        if (lockedRef.current) unlock();
      }
    });
    return () => sub.remove();
  }, [unlock]);

  // Auto-Sperre: liegt die App so lange unberührt offen, sperrt sie sich selbst.
  // Die Einstellung wird bei jeder Prüfung frisch gelesen, damit Änderungen sofort gelten.
  useEffect(() => {
    const id = setInterval(async () => {
      if (lockedRef.current !== false || authenticating.current) return;
      try {
        const [on, minutes] = await Promise.all([appLockPreference.get(), autoLockPreference.get()]);
        if (on && minutes > 0 && Date.now() - lastTouch.current >= minutes * 60000) setLocked(true);
      } catch {
        // Einstellung nicht lesbar: lieber nicht sperren
      }
    }, AUTO_LOCK_CHECK_MS);
    return () => clearInterval(id);
  }, []);

  const content =
    locked === false ? (
      // Fängt keine Berührung ab, merkt sich nur ihren Zeitpunkt für die Auto-Sperre
      <View
        style={{ flex: 1 }}
        onStartShouldSetResponderCapture={() => {
          lastTouch.current = Date.now();
          return false;
        }}
      >
        {children}
      </View>
    ) : (
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

  return (
    <View style={{ flex: 1 }}>
      {content}
      {covered && (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}
        >
          <Image source={require('../../assets/icon.png')} style={{ width: 96, height: 96, borderRadius: 22 }} />
        </View>
      )}
    </View>
  );
}
