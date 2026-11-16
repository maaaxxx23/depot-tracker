import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { VisitBannerContent } from '../../finance/visit';
import { pct, relativeTime, signedEur } from '../format';
import { PrivateText } from '../privacy';
import { font, radius, signColor, useStyles } from '../styles';

const SHOW_MS = 5000;
const SLIDE_MS = 320;

/**
 * Banner, das oben hereingleitet und nach ein paar Sekunden von selbst verschwindet:
 * Kursbewegung seit dem letzten Besuch, oder der Hinweis, dass es keine neuen Kurse gibt.
 */
export function VisitBanner({ content, onDone }: { content: VisitBannerContent; onDone: () => void }) {
  const { theme, styles } = useStyles();
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;

  const hide = () =>
    Animated.timing(slide, { toValue: 0, duration: SLIDE_MS, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => finished && onDone());

  useEffect(() => {
    Animated.timing(slide, { toValue: 1, duration: SLIDE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const timer = setTimeout(hide, SHOW_MS);
    return () => clearTimeout(timer);
  }, []);

  const isChange = content.kind === 'change';
  const color = isChange ? signColor(theme, content.amount) : theme.muted;
  const up = isChange && content.amount >= 0;
  const icon = !isChange ? 'time-outline' : up ? 'trending-up' : 'trending-down';
  const iconBackground = !isChange ? theme.chip : up ? `${theme.positive}22` : `${theme.negative}22`;
  const headline = content.since ? `Seit deinem letzten Besuch · ${relativeTime(new Date(content.since))}` : 'Seit deinem letzten Besuch';

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        top: insets.top + 6,
        opacity: slide,
        transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-120, 0] }) }],
      }}
    >
      <Pressable
        onPress={hide}
        accessibilityRole="button"
        accessibilityLabel="Hinweis schließen"
        style={[
          styles.card,
          styles.row,
          {
            gap: 14,
            paddingVertical: 14,
            borderWidth: 1,
            borderColor: theme.border,
          },
          styles.floatingHigh,
        ]}
      >
        <View style={{ width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: iconBackground }}>
          <Ionicons name={icon} size={22} color={color} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={[styles.row, { gap: 6 }]}>
            {isChange && content.sample && (
              <View style={{ backgroundColor: theme.chip, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                <Text style={{ fontSize: font.badge, fontWeight: '700', color: theme.muted }}>BEISPIEL</Text>
              </View>
            )}
            <Text style={[styles.small, { flexShrink: 1 }]}>{headline}</Text>
          </View>
          {isChange ? (
            <>
              <View style={[styles.row, { flexWrap: 'wrap' }]}>
                <PrivateText style={[styles.number, { fontSize: font.statSmall, fontWeight: '700', color }]}>{`${content.estimate ? '≈ ' : ''}${signedEur(content.amount)}`}</PrivateText>
                <Text style={[styles.number, { fontSize: font.statSmall, fontWeight: '700', color }]}> · {pct(content.rel)}</Text>
              </View>
              <Text style={styles.small}>
                {content.sample
                  ? 'Demo-Daten: erfundene Zahlen zur Ansicht'
                  : content.estimate
                    ? 'Kursbewegung deiner Anteile, geschätzt'
                    : 'Kursbewegung deiner Anteile, ohne Ein- und Auszahlungen'}
              </Text>
            </>
          ) : (
            <>
              <Text style={{ fontSize: font.heading, fontWeight: '700', color: theme.text }}>{content.since ? 'Keine neuen Kurse' : 'Noch kein Vergleich'}</Text>
              <Text style={styles.small}>
                {content.since
                  ? 'Außerhalb der Börsenzeiten bewegt sich nichts. Während des Handels kommen alle 15 Minuten neue Kurse.'
                  : 'Die App merkt sich deinen Stand, sobald du sie verlässt. Beim nächsten Öffnen siehst du hier die Veränderung.'}
              </Text>
            </>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}
