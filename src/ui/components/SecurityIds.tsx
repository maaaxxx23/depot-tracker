import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useStyles } from '../styles';

const COPIED_MS = 1500;

/** ISIN und WKN als zwei Knöpfe: Antippen kopiert genau diese eine Nummer in die Zwischenablage. */
export function SecurityIds({ isin, wkn }: { isin: string; wkn?: string }) {
  const { theme, styles } = useStyles();
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = (value: string) => {
    Clipboard.setStringAsync(value)
      .then(() => {
        setCopied(value);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(null), COPIED_MS);
      })
      .catch(() => {});
  };

  const ids = [{ label: 'ISIN', value: isin }, ...(wkn ? [{ label: 'WKN', value: wkn }] : [])];
  return (
    <View style={[styles.row, { flexWrap: 'wrap', gap: 6 }]}>
      {ids.map(({ label, value }) => {
        const done = copied === value;
        return (
          <Pressable
            key={label}
            onPress={() => copy(value)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${value} kopieren`}
            style={({ pressed }) => [styles.row, { gap: 5, backgroundColor: theme.chip, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.small, styles.number, { color: done ? theme.positive : theme.text }]}>{done ? `${label} kopiert` : `${label} ${value}`}</Text>
            <Ionicons name={done ? 'checkmark' : 'copy-outline'} size={13} color={done ? theme.positive : theme.muted} />
          </Pressable>
        );
      })}
    </View>
  );
}
