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
  const { locked, covered, veiled } = useShield();
  // Auch warten, solange der Vorhang noch offen schwingt – sonst tippt die Zahl unsichtbar
  const blocked = locked || covered || veiled;
  const [display, setDisplay] = useState('');
  const displayRef = useRef(display);
  displayRef.current = display;

  useEffect(() => {
    if (hidden || blocked) {
      setDisplay('');
      return;
    }
    // Zeitbasiert statt Schritt für Schritt: Ist der JavaScript-Thread kurz beschäftigt
    // (z. B. Kurs-Nachladen beim Aktivieren), holt die Animation auf, statt sich zu dehnen.
    const startText = displayRef.current;
    if (startText === children) return;
    let prefix = 0;
    while (prefix < startText.length && prefix < children.length && startText[prefix] === children[prefix]) prefix++;
    const eraseCount = startText.length - prefix;
    const start = Date.now();
    const at = (elapsed: number) => {
      const erased = Math.min(eraseCount, Math.floor(elapsed / ERASE_MS));
      if (erased < eraseCount) return startText.slice(0, startText.length - erased);
      const typed = Math.min(children.length - prefix, Math.floor((elapsed - eraseCount * ERASE_MS) / TYPE_MS));
      return children.slice(0, prefix + typed);
    };
    const id = setInterval(() => {
      const next = at(Date.now() - start);
      if (next !== displayRef.current) setDisplay(next);
      if (next === children) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
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
