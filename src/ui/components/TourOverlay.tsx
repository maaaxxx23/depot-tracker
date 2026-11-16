import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { tapFeedback } from '../haptics';
import { font, radius, useStyles } from '../styles';

export interface TourRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  /** Bereich, der hell bleibt; null = noch nicht vermessen (alles abgedunkelt) */
  rect: TourRect | null;
  title: string;
  text: string;
  step: number;
  total: number;
  onNext: () => void;
  onSkip: () => void;
}

const DIM = 'rgba(0, 0, 0, 0.62)';
/** Die Aussparung ist etwas größer als die Karte, damit die Rundungen frei bleiben. */
const PAD = 6;
/** Grobe Höhe der Textblase, um zu entscheiden, ob sie über oder unter die Karte passt. */
const BUBBLE_GUESS = 190;

/**
 * Spotlight für die Tour: Das Dunkel blendet weich ein, die helle Aussparung öffnet sich
 * aus der Mitte der ersten Station und gleitet danach von Karte zu Karte. Die Textblase
 * wechselt mit einer kleinen Blende, Tippen auf den hellen Bereich führt ebenfalls weiter.
 */
export function TourOverlay({ rect, title, text, step, total, onNext, onSkip }: Props) {
  const { theme, styles } = useStyles();
  const { height } = useWindowDimensions();

  const fade = useRef(new Animated.Value(0)).current;
  const bubbleFade = useRef(new Animated.Value(0)).current;
  // Animierte Aussparung (Layout-Werte, daher ohne nativen Treiber)
  const hole = useRef({ x: new Animated.Value(0), y: new Animated.Value(0), w: new Animated.Value(0), h: new Animated.Value(0) }).current;
  const [hasHole, setHasHole] = useState(false);

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 240, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!rect) return;
    const r = { x: rect.x - PAD, y: rect.y - PAD, w: rect.width + PAD * 2, h: rect.height + PAD * 2 };
    if (!hasHole) {
      // Erste Station: aus der Mitte der Karte aufziehen
      hole.x.setValue(r.x + r.w / 2);
      hole.y.setValue(r.y + r.h / 2);
      hole.w.setValue(0);
      hole.h.setValue(0);
      setHasHole(true);
    }
    const timing = (v: Animated.Value, to: number) => Animated.timing(v, { toValue: to, duration: 320, easing: Easing.inOut(Easing.cubic), useNativeDriver: false });
    Animated.parallel([timing(hole.x, r.x), timing(hole.y, r.y), timing(hole.w, r.w), timing(hole.h, r.h)]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect]);

  // Die Textblase blendet bei jedem Stationswechsel neu ein, sobald die Aussparung gleitet
  useEffect(() => {
    bubbleFade.setValue(0);
    const anim = Animated.timing(bubbleFade, { toValue: 1, duration: 260, delay: 320, easing: Easing.out(Easing.ease), useNativeDriver: true });
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, rect === null]);

  const next = () => {
    tapFeedback();
    onNext();
  };

  const right = Animated.add(hole.x, hole.w);
  const bottom = Animated.add(hole.y, hole.h);
  const below = !rect || rect.y + rect.height + PAD + BUBBLE_GUESS < height - 24;

  return (
    <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: fade }}>
      {hasHole ? (
        <>
          <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: hole.y, backgroundColor: DIM }} />
          <Animated.View style={{ position: 'absolute', top: hole.y, left: 0, width: hole.x, height: hole.h, backgroundColor: DIM }} />
          <Animated.View style={{ position: 'absolute', top: hole.y, left: right, right: 0, height: hole.h, backgroundColor: DIM }} />
          <Animated.View style={{ position: 'absolute', top: bottom, left: 0, right: 0, bottom: 0, backgroundColor: DIM }} />
          {/* Fängt Tipps auf den hellen Bereich ab, damit die Karte darunter nicht reagiert */}
          <Animated.View style={{ position: 'absolute', top: hole.y, left: hole.x, width: hole.w, height: hole.h }}>
            <Pressable onPress={next} style={{ flex: 1 }} accessibilityLabel="Weiter zur nächsten Station" />
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={{ position: 'absolute', top: hole.y, left: hole.x, width: hole.w, height: hole.h, borderRadius: 18, borderWidth: 2, borderColor: theme.accent }}
          />
        </>
      ) : (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: DIM }} />
      )}

      <Animated.View
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          opacity: bubbleFade,
          ...(below ? { top: (rect ? rect.y + rect.height + PAD : height * 0.45) + 14 } : { bottom: height - (rect ? rect.y - PAD : height * 0.45) + 14 }),
        }}
      >
        <View
          style={[
            styles.card,
            { gap: 8, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } },
          ]}
        >
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.text}>{text}</Text>
          <View style={[styles.row, { justifyContent: 'space-between', marginTop: 2 }]}>
            <Pressable onPress={onSkip} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.text, { color: theme.muted }]}>Überspringen</Text>
            </Pressable>
            <Text style={[styles.small, styles.number]}>
              {step + 1} / {total}
            </Text>
            <Pressable
              onPress={next}
              accessibilityRole="button"
              style={({ pressed }) => ({ backgroundColor: theme.accent, borderRadius: radius.control, paddingVertical: 8, paddingHorizontal: 18, opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={{ color: theme.onAccent, fontSize: font.body, fontWeight: '600' }}>{step + 1 === total ? 'Fertig' : 'Weiter'}</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}
