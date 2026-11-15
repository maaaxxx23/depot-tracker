import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Image, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { appLockPreference, autoLockPreference } from '../data/store';
import { useStyles } from './styles';

/**
 * Sperr- und Vorhang-Zustand für Stellen außerhalb des normalen Baums: Die Detailblätter
 * sind native Modals und liegen ÜBER den Overlays der App, deshalb decken sie sich über
 * ShieldOverlay selbst ab.
 */
const ShieldContext = createContext<{ locked: boolean; covered: boolean; unlock: () => void }>({ locked: false, covered: false, unlock: () => {} });

/** Ist die App gerade verdeckt (gesperrt oder nicht im Vordergrund)? Z. B. für Einblendungen, die warten sollen. */
export function useShield() {
  return useContext(ShieldContext);
}

/** Blickdichte Abdeckung für ein Modal: App-Symbol bzw. Sperrbildschirm. */
export function ShieldOverlay() {
  const { locked, covered, unlock } = useContext(ShieldContext);
  const { theme } = useStyles();
  if (!locked && !covered) return null;
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme.background,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
      }}
    >
      <Image source={require('../../assets/icon.png')} style={{ width: 96, height: 96, borderRadius: 22 }} />
      {locked && !covered && (
        <>
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
}

/** So oft prüft die App, ob die Auto-Sperre fällig ist. */
const AUTO_LOCK_CHECK_MS = 10000;

/**
 * Vorhang und Sperre in einem: Verlässt die App den Vordergrund, laufen zwei Hälften wie
 * ein Theatervorhang zusammen (schnell, bevor iOS die Vorschau aufnimmt). Ist die Sperre
 * aktiv, bleibt der Vorhang beim Zurückkommen geschlossen und trägt Sperrtext samt
 * Entsperren-Knopf – erst nach Face ID (oder Geräte-Code) öffnet er sich und gibt die
 * weiterlaufende App frei. So überlebt z. B. eine comdirect-Anmeldung den Wechsel in die
 * photoTAN-App, und der Vorhang-Effekt bleibt bei jedem Entsperren sichtbar.
 */
export function AppLock({ children }: { children: React.ReactNode }) {
  const { theme } = useStyles();
  // null = Einstellung wird noch gelesen: solange bleibt der Vorhang zu, damit nichts aufblitzt
  const [locked, setLocked] = useState<boolean | null>(null);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const authenticating = useRef(false);
  // Nicht aktiv im Vordergrund (App-Wechsler, andere App, Face-ID-Abfrage)
  const [away, setAway] = useState(AppState.currentState !== 'active');
  const { width } = useWindowDimensions();
  // Der Vorhang startet geschlossen und öffnet sich erst, wenn klar ist, dass keine Sperre aktiv ist
  const [coverMounted, setCoverMounted] = useState(true);
  const coverProgress = useRef(new Animated.Value(1)).current;
  const closeCover = useCallback(
    (duration = 140) => {
      setCoverMounted(true);
      Animated.timing(coverProgress, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    },
    [coverProgress],
  );
  const openCover = useCallback(() => {
    Animated.timing(coverProgress, { toValue: 0, duration: 380, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (finished) setCoverMounted(false);
    });
  }, [coverProgress]);
  const lastTouch = useRef(Date.now());

  const unlock = useCallback(async () => {
    if (authenticating.current) return;
    authenticating.current = true;
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Depot Tracker entsperren' });
      if (result.success) {
        lastTouch.current = Date.now();
        setLocked(false);
        openCover();
      }
    } catch {
      // Abbruch oder Face ID nicht verfügbar: der Entsperren-Knopf bleibt für den nächsten Versuch
    } finally {
      authenticating.current = false;
    }
  }, [openCover]);

  useEffect(() => {
    appLockPreference
      .get()
      .then((on) => {
        setLocked(on);
        if (on) {
          unlock();
        } else {
          openCover();
        }
      })
      .catch(() => {
        setLocked(false);
        openCover();
      });
  }, [unlock, openCover]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setAway(state !== 'active');
      if (state !== 'active') {
        closeCover();
      }
      if (state === 'background') {
        appLockPreference
          .get()
          .then((on) => on && setLocked(true))
          .catch(() => {});
      } else if (state === 'active') {
        lastTouch.current = Date.now();
        if (lockedRef.current) {
          // Vorhang bleibt zu, bis entsperrt ist
          unlock();
        } else {
          openCover();
        }
      }
    });
    return () => sub.remove();
  }, [unlock, closeCover, openCover]);

  // Auto-Sperre: liegt die App so lange unberührt offen, schließt sich der Vorhang und bleibt zu.
  // Die Einstellung wird bei jeder Prüfung frisch gelesen, damit Änderungen sofort gelten.
  useEffect(() => {
    const id = setInterval(async () => {
      if (lockedRef.current !== false || authenticating.current) return;
      try {
        const [on, minutes] = await Promise.all([appLockPreference.get(), autoLockPreference.get()]);
        if (on && minutes > 0 && Date.now() - lastTouch.current >= minutes * 60000) {
          closeCover(350);
          setLocked(true);
        }
      } catch {
        // Einstellung nicht lesbar: lieber nicht sperren
      }
    }, AUTO_LOCK_CHECK_MS);
    return () => clearInterval(id);
  }, [closeCover]);

  const showLockUi = locked === true && !away;
  const curtain = coverMounted || locked !== false;

  return (
    <ShieldContext.Provider value={{ locked: locked !== false, covered: away, unlock }}>
      <View style={{ flex: 1 }}>
        {/* Die App bleibt auch gesperrt am Leben, damit z. B. eine laufende comdirect-Anmeldung
            den Wechsel zur photoTAN-App überlebt. Berührungen werden nicht abgefangen, nur ihr
            Zeitpunkt für die Auto-Sperre gemerkt. */}
        <View
          style={{ flex: 1 }}
          onStartShouldSetResponderCapture={() => {
            lastTouch.current = Date.now();
            return false;
          }}
          accessibilityElementsHidden={locked !== false}
          importantForAccessibility={locked !== false ? 'no-hide-descendants' : 'auto'}
        >
          {children}
        </View>
        {curtain && (
          <View
            pointerEvents={showLockUi ? 'auto' : 'none'}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}
          >
            {/* Linke und rechte Vorhanghälfte; 1 px Überlappung, damit in der Mitte kein Spalt bleibt */}
            <Animated.View
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                width: width / 2 + 1,
                backgroundColor: theme.background,
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
                backgroundColor: theme.background,
                transform: [{ translateX: coverProgress.interpolate({ inputRange: [0, 1], outputRange: [width / 2 + 1, 0] }) }],
              }}
            />
            {/* App-Symbol und – bei aktiver Sperre – Sperrtext und Entsperren direkt auf dem Vorhang */}
            <Animated.View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14,
                opacity: coverProgress.interpolate({ inputRange: [0.75, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
              }}
            >
              <Image source={require('../../assets/icon.png')} style={{ width: 96, height: 96, borderRadius: 22 }} />
              {showLockUi && (
                <>
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
            </Animated.View>
          </View>
        )}
      </View>
    </ShieldContext.Provider>
  );
}
