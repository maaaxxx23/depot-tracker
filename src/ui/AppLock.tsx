import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Image, Pressable, Text, useWindowDimensions, View } from 'react-native';
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
  // Vorhang, solange die App nicht aktiv im Vordergrund ist (auch in der Multitasking-Ansicht).
  // Zwei schwarze Hälften laufen wie ein Theatervorhang zusammen: schnell zu (bevor iOS die
  // Vorschau aufnimmt), gemächlich wieder auf.
  const { width } = useWindowDimensions();
  const [coverMounted, setCoverMounted] = useState(AppState.currentState !== 'active');
  const coverProgress = useRef(new Animated.Value(AppState.currentState !== 'active' ? 1 : 0)).current;
  const setCovered = useCallback(
    (show: boolean) => {
      if (show) {
        setCoverMounted(true);
        Animated.timing(coverProgress, { toValue: 1, duration: 140, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      } else {
        Animated.timing(coverProgress, { toValue: 0, duration: 380, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
          if (finished) setCoverMounted(false);
        });
      }
    },
    [coverProgress],
  );
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
  }, [unlock, setCovered]);

  // Sperren mit Vorhang: Er schließt sich über der App, dahinter wird auf „gesperrt“
  // gewechselt, dann öffnet er sich und gibt den Sperrbildschirm frei.
  const lockingWithCurtain = useRef(false);
  const lockWithCurtain = useCallback(() => {
    if (lockingWithCurtain.current) return;
    lockingWithCurtain.current = true;
    setCoverMounted(true);
    Animated.timing(coverProgress, { toValue: 1, duration: 350, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start(() => {
      setLocked(true);
      Animated.timing(coverProgress, { toValue: 0, duration: 380, delay: 150, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
        if (finished) setCoverMounted(false);
        lockingWithCurtain.current = false;
      });
    });
  }, [coverProgress]);

  // Auto-Sperre: liegt die App so lange unberührt offen, sperrt sie sich selbst.
  // Die Einstellung wird bei jeder Prüfung frisch gelesen, damit Änderungen sofort gelten.
  useEffect(() => {
    const id = setInterval(async () => {
      if (lockedRef.current !== false || authenticating.current || lockingWithCurtain.current) return;
      try {
        const [on, minutes] = await Promise.all([appLockPreference.get(), autoLockPreference.get()]);
        if (on && minutes > 0 && Date.now() - lastTouch.current >= minutes * 60000) lockWithCurtain();
      } catch {
        // Einstellung nicht lesbar: lieber nicht sperren
      }
    }, AUTO_LOCK_CHECK_MS);
    return () => clearInterval(id);
  }, [lockWithCurtain]);

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
              <Text style={{ color: theme.onAccent, fontSize: 16, fontWeight: '600' }}>Entsperren</Text>
            </Pressable>
          </>
        )}
      </View>
    );

  return (
    <View style={{ flex: 1 }}>
      {content}
      {coverMounted && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
          {/* Linke und rechte Vorhanghälfte; 1 px Überlappung, damit in der Mitte kein Spalt bleibt */}
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: width / 2 + 1,
              backgroundColor: '#000',
              transform: [{ translateX: coverProgress.interpolate({ inputRange: [0, 1], outputRange: [-(width / 2 + 1), 0] }) }],
            }}
          />
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              right: 0,
              width: width / 2 + 1,
              backgroundColor: '#000',
              transform: [{ translateX: coverProgress.interpolate({ inputRange: [0, 1], outputRange: [width / 2 + 1, 0] }) }],
            }}
          />
          {/* Das Symbol erscheint erst, wenn der Vorhang fast geschlossen ist */}
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: coverProgress.interpolate({ inputRange: [0.75, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
            }}
          >
            <Image source={require('../../assets/icon.png')} style={{ width: 96, height: 96, borderRadius: 22 }} />
          </Animated.View>
        </View>
      )}
    </View>
  );
}
