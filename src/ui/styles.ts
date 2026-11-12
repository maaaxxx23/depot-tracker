import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Theme, useTheme } from './theme';

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    card: { backgroundColor: t.card, borderRadius: 16, padding: 16, gap: 12 },
    cardTitle: { fontSize: 17, fontWeight: '600', color: t.text },
    label: { fontSize: 13, color: t.muted },
    text: { fontSize: 15, color: t.text, lineHeight: 21 },
    small: { fontSize: 12, color: t.muted },
    number: { fontVariant: ['tabular-nums'] },
    row: { flexDirection: 'row', alignItems: 'center' },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
  });

export type Styles = ReturnType<typeof makeStyles>;

export function useStyles() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return { theme, styles };
}

/** Grün für Gewinn, Rot für Verlust, sonst neutral. */
export const signColor = (t: Theme, n: number | null) => (n === null || n === 0 ? t.text : n > 0 ? t.positive : t.negative);
