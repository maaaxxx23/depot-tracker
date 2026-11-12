import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import Svg, { Defs, FeGaussianBlur, Filter, Text as SvgText } from 'react-native-svg';

const STORAGE_KEY = 'privacy-hidden';
const FADE_MS = 220;
// Unschärfe wächst mit der Schriftgröße, aber gedämpft: große Zahlen sollen verschwimmen, nicht verschwinden
const BLUR_BASE = 3;
const BLUR_PER_FONT_PX = 0.2;

interface PrivacyState {
  hidden: boolean;
  toggle: () => void;
}

const PrivacyContext = createContext<PrivacyState>({ hidden: false, toggle: () => {} });

/** Merkt sich, ob Euro-Beträge und Stückzahlen verwischt werden. */
export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => setHidden(v === '1'))
      .catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    setHidden((h) => {
      AsyncStorage.setItem(STORAGE_KEY, h ? '0' : '1').catch(() => {});
      return !h;
    });
  }, []);

  const value = useMemo(() => ({ hidden, toggle }), [hidden, toggle]);
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}

// Fester, kurzer Platzhalter: jeder verborgene Betrag ist gleich lang, damit weder Ziffern noch Länge etwas verraten
const PLACEHOLDER = '5281';

/**
 * Ersetzt jeden Betrag durch einen Platzhalter fester Länge, samt Tausender- und Dezimalzeichen
 * und Währung („€“, „T€“). Nur das Vorzeichen bleibt (die Farbe verrät es ohnehin) und Text drumherum,
 * z. B. „Verkauf −1.250 €“ → „Verkauf −5281“.
 */
export function mask(text: string): string {
  let found = false;
  const masked = text.replace(/(?:([+\-−])\s*)?\d[\d.,\s]*(?:T?€)?/g, (_, sign: string | undefined) => {
    found = true;
    return `${sign ?? ''}${PLACEHOLDER}`;
  });
  // Währungszeichen auch dann entfernen, wenn das Zahlenformat des Geräts anders aussieht als erwartet
  return found ? masked.replace(/\s*T?[€$£]/g, '').trim() : PLACEHOLDER;
}

/** Unschärfe-Filter für SVG-Text, z. B. die Achsenbeschriftung im Chart. */
export function BlurFilter({ id, stdDeviation }: { id: string; stdDeviation: number }) {
  return (
    <Defs>
      <Filter id={id} x="-50%" y="-50%" width="200%" height="200%">
        <FeGaussianBlur stdDeviation={stdDeviation} />
      </Filter>
    </Defs>
  );
}

export const blurForFont = (fontSize: number) => BLUR_BASE + fontSize * BLUR_PER_FONT_PX;

/** Gültige SVG-ID aus Reacts useId (das Doppelpunkte enthält). */
export function useSvgId(prefix: string) {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

interface PrivateTextProps {
  children: string;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * Betrag, der im Privatsphäre-Modus weich verschwimmt. Alles passiert gleichzeitig in einer
 * Bewegung: Der echte Betrag blendet aus, der verwischte Platzhalter blendet ein, und die Breite
 * gleitet zwischen beiden. Die verwischte Ebene zeigt immer nur den Platzhalter, nie den Betrag.
 */
export function PrivateText({ children, style, containerStyle }: PrivateTextProps) {
  const { hidden } = usePrivacy();
  const filterId = useSvgId('blur');
  const placeholder = mask(children);
  const [real, setReal] = useState<{ width: number; height: number } | null>(null);
  const [maskWidth, setMaskWidth] = useState<number | null>(null);
  const [showBlur, setShowBlur] = useState(hidden);
  const fade = useRef(new Animated.Value(hidden ? 1 : 0)).current;
  const width = useRef(new Animated.Value(0)).current;
  const measured = real !== null && maskWidth !== null;

  // Neue Messung (z. B. anderer Betrag nach Zeitraumwechsel): Breite ohne Animation übernehmen
  useLayoutEffect(() => {
    if (measured) width.setValue(hidden ? maskWidth : real.width);
  }, [real?.width, maskWidth]);

  useEffect(() => {
    if (hidden) setShowBlur(true);
    const timing = { duration: FADE_MS, easing: Easing.inOut(Easing.ease) };
    const animations = [Animated.timing(fade, { ...timing, toValue: hidden ? 1 : 0, useNativeDriver: Platform.OS !== 'web' })];
    if (real && maskWidth !== null) {
      animations.push(Animated.timing(width, { ...timing, toValue: hidden ? maskWidth : real.width, useNativeDriver: false }));
    }
    Animated.parallel(animations).start(({ finished }) => {
      if (finished && !hidden) setShowBlur(false);
    });
  }, [hidden]);

  const flat = StyleSheet.flatten(style) ?? {};
  const fontSize = flat.fontSize ?? 14;
  const blur = blurForFont(fontSize);
  const margin = Math.ceil(blur * 3);
  const svgWidth = Math.max(real?.width ?? 0, maskWidth ?? 0) + margin * 2;

  return (
    <View
      style={[{ alignSelf: 'flex-start' }, containerStyle]}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      {/* Unsichtbare Messung von echtem Betrag und Platzhalter */}
      <View pointerEvents="none" style={styles.measure} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={[style, styles.measureText]} onLayout={(e) => setReal({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
          {children}
        </Text>
        <Text style={[style, styles.measureText]} onLayout={(e) => setMaskWidth(e.nativeEvent.layout.width)}>
          {placeholder}
        </Text>
      </View>

      <Animated.View style={measured ? { width, height: real.height } : { opacity: 0 }}>
        <Animated.Text
          numberOfLines={1}
          style={[style, styles.layer, real && { width: real.width }, { opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
        >
          {children}
        </Animated.Text>
      </Animated.View>

      {showBlur && real && (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: -margin, top: -margin, opacity: fade }}>
          <Svg width={svgWidth} height={real.height + margin * 2}>
            <BlurFilter id={filterId} stdDeviation={blur} />
            <SvgText
              x={margin}
              // Grundlinie etwa auf Höhe des echten Textes
              y={margin + real.height / 2 + fontSize * 0.35}
              fontSize={fontSize}
              fontWeight={flat.fontWeight}
              letterSpacing={flat.letterSpacing}
              fill={typeof flat.color === 'string' ? flat.color : '#888'}
              filter={`url(#${filterId})`}
            >
              {placeholder}
            </SvgText>
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Breiter, unsichtbarer Messbereich, damit nichts umbricht. Keine feste Höhe: iOS würde
  // sonst die Texthöhe als 0 melden. Durch position: absolute nimmt er trotzdem keinen Platz ein.
  measure: { position: 'absolute', top: 0, left: 0, width: 9999, opacity: 0 },
  measureText: { alignSelf: 'flex-start' },
  layer: { position: 'absolute', top: 0, left: 0 },
});
