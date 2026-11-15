import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable } from 'react-native';
import { useStyles } from '../styles';

/** Kleiner Infopunkt neben einer Überschrift: Antippen zeigt die Erklärung als Hinweisfenster. */
export function InfoDot({ title, text }: { title: string; text: string }) {
  const { theme } = useStyles();
  return (
    <Pressable
      onPress={() => Alert.alert(title, text)}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={`Erklärung zu ${title}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
    >
      <Ionicons name="information-circle-outline" size={17} color={theme.accent} />
    </Pressable>
  );
}
