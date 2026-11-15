import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useStyles } from '../styles';

interface Props {
  message: string;
  /** Abstand zur Oberkante (Safe Area) */
  topInset: number;
  onDone: () => void;
}

/** Kurze Erfolgs-Einblendung oben: schwebt herein, bleibt zwei Sekunden, löst sich auf. */
export function SuccessToast({ message, topInset, onDone }: Props) {
  const { theme } = useStyles();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(progress, { toValue: 0, duration: 300, easing: Easing.in(Easing.ease), useNativeDriver: true }),
    ]).start(({ finished }) => finished && onDone());
    // Nur beim Erscheinen starten; onDone ändert sich mit jedem Render des Dashboards
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: topInset + 8,
        left: 0,
        right: 0,
        alignItems: 'center',
        opacity: progress,
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: theme.card,
          borderRadius: 20,
          paddingVertical: 8,
          paddingHorizontal: 14,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
          shadowColor: '#000',
          shadowOpacity: 0.15,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
        }}
      >
        <Ionicons name="checkmark-circle" size={18} color={theme.positive} />
        <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>{message}</Text>
      </View>
    </Animated.View>
  );
}
