import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { tapFeedback } from '../haptics';
import { useStyles } from '../styles';

export interface TourRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  /** Bereich, der hell bleibt; null = wird gerade positioniert (alles abgedunkelt) */
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
 * Spotlight für die Tour: Vier dunkle Flächen rahmen den erklärten Bereich ein, eine
 * goldene Kontur hebt ihn hervor, und die Textblase liegt darüber oder darunter –
 * je nachdem, wo Platz ist. Tippen auf den hellen Bereich führt ebenfalls weiter.
 */
export function TourOverlay({ rect, title, text, step, total, onNext, onSkip }: Props) {
  const { theme, styles } = useStyles();
  const { height } = useWindowDimensions();

  const r = rect ? { x: rect.x - PAD, y: rect.y - PAD, w: rect.width + PAD * 2, h: rect.height + PAD * 2 } : null;
  const below = !r || r.y + r.h + BUBBLE_GUESS < height - 24;
  const next = () => {
    tapFeedback();
    onNext();
  };

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {r ? (
        <>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: Math.max(0, r.y), backgroundColor: DIM }} />
          <View style={{ position: 'absolute', top: r.y, left: 0, width: Math.max(0, r.x), height: r.h, backgroundColor: DIM }} />
          <View style={{ position: 'absolute', top: r.y, left: r.x + r.w, right: 0, height: r.h, backgroundColor: DIM }} />
          <View style={{ position: 'absolute', top: r.y + r.h, left: 0, right: 0, bottom: 0, backgroundColor: DIM }} />
          {/* Fängt Tipps auf den hellen Bereich ab, damit die Karte darunter nicht reagiert */}
          <Pressable onPress={next} style={{ position: 'absolute', top: r.y, left: r.x, width: r.w, height: r.h }} accessibilityLabel="Weiter zur nächsten Station" />
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: r.y, left: r.x, width: r.w, height: r.h, borderRadius: 18, borderWidth: 2, borderColor: theme.accent }}
          />
        </>
      ) : (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: DIM }} />
      )}

      <View
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          ...(below ? { top: (r ? r.y + r.h : height * 0.45) + 14 } : { bottom: height - (r ? r.y : height * 0.45) + 14 }),
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
              style={({ pressed }) => ({ backgroundColor: theme.accent, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 18, opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={{ color: theme.onAccent, fontSize: 15, fontWeight: '600' }}>{step + 1 === total ? 'Fertig' : 'Weiter'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
