import { useEffect, useRef, useState } from 'react';
import { StyleProp, Text, TextStyle, View } from 'react-native';
import { useShield } from '../AppLock';
import { PrivateText, usePrivacy } from '../privacy';

/** Tempo pro Zeichen: Löschen flott wie eine gehaltene Backspace, Tippen einen Hauch bedächtiger. */
const ERASE_MS = 30;
const TYPE_MS = 45;

/**
 * Betrag, der sich wie auf einer Tastatur auftippt. Ändert sich der Wert, werden erst die
 * Ziffern bis zum gemeinsamen Anfang mit Backspace entfernt, dann tippt sich der neue Wert.
 * Hinter Sperre, Vorhang oder Auge wartet die Animation; danach tippt der Wert frisch.
 */
export function TypedAmount({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  const { hidden } = usePrivacy();
  const { locked, covered } = useShield();
  const blocked = locked || covered;
  const [display, setDisplay] = useState('');
  const displayRef = useRef(display);
  displayRef.current = display;

  useEffect(() => {
    if (hidden || blocked) {
      setDisplay('');
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      const current = displayRef.current;
      if (current === children) return;
      if (children.startsWith(current)) {
        setDisplay(children.slice(0, current.length + 1));
        timer = setTimeout(step, TYPE_MS);
      } else {
        setDisplay(current.slice(0, -1));
        timer = setTimeout(step, ERASE_MS);
      }
    };
    timer = setTimeout(step, TYPE_MS);
    return () => clearTimeout(timer);
  }, [children, hidden, blocked]);

  // Der unsichtbare Text hält Höhe und Breite in beiden Modi stabil (der längere von altem
  // und neuem Wert), damit die Seite beim Auge-Umschalten nicht springt. Darüber liegt der
  // getippte Stand bzw. im Privatsphäre-Modus der verwischte Platzhalter.
  const sizing = display.length > children.length ? display : children;
  return (
    <View style={{ alignSelf: 'flex-start' }}>
      <Text style={[style, { opacity: 0 }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {sizing}
      </Text>
      {hidden ? (
        <PrivateText containerStyle={{ position: 'absolute', left: 0, top: 0 }} style={style}>
          {children}
        </PrivateText>
      ) : (
        <Text style={[style, { position: 'absolute', left: 0, top: 0 }]} accessibilityLabel={children}>
          {display}
        </Text>
      )}
    </View>
  );
}
