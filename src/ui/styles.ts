import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Theme, useTheme } from './theme';

/** Schriftgrößen-Rampe: jede sichtbare Größe hat genau einen Namen; keine rohen Zahlen in Komponenten. */
export const font = {
  /** Mini-Etiketten wie „BEISPIEL“ */
  badge: 11,
  /** Fußnoten (styles.small) */
  small: 12,
  /** Beschriftungen (styles.label) */
  label: 13,
  /** Chips und kleine Buttons */
  chip: 14,
  /** Fließtext (styles.text) */
  body: 15,
  /** Primäre Buttons und Eingaben */
  button: 16,
  /** Kartentitel (styles.cardTitle) */
  title: 17,
  /** Abschnittstitel in Blättern und im Banner */
  heading: 18,
  /** Kleinere Kennzahlen (Jahreszahl, Banner-Betrag) */
  statSmall: 20,
  /** Blatt-Titel und mittlere Kennzahlen */
  sheetTitle: 22,
  /** Große Prozent-Kennzahlen */
  stat: 24,
  /** Summen in Blättern */
  heroSheet: 34,
  /** Depotwert auf der Startseite */
  hero: 44,
} as const;

/** Eckenradien: die Formsprache der App. Kleinere Werte (2–6, 11, 18) sind Geometrie einzelner Elemente. */
export const radius = {
  /** Punkte und Mini-Balken (bei 8-px-Elementen ein Kreis) */
  tiny: 4,
  /** Kleine Flächen */
  small: 8,
  /** Chips und kompakte Bedienelemente */
  control: 10,
  /** Buttons, Eingaben und Hinweiskästen */
  button: 12,
  /** Karten (styles.card) */
  card: 16,
  /** Pillen */
  pill: 20,
  /** Das App-Symbol in 96 px (iOS-Rundung) */
  icon: 22,
} as const;

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    card: { backgroundColor: t.card, borderRadius: radius.card, padding: 16, gap: 12 },
    cardTitle: { fontSize: font.title, fontWeight: '600', color: t.text },
    label: { fontSize: font.label, color: t.muted },
    text: { fontSize: font.body, color: t.text, lineHeight: 21 },
    small: { fontSize: font.small, color: t.muted },
    number: { fontVariant: ['tabular-nums'] },
    row: { flexDirection: 'row', alignItems: 'center' },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
    /** Schwebende Elemente nah an der Fläche (Toast) */
    floating: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
    /** Deutlich schwebende Elemente (Banner); die Tour-Blase über der Abdunkelung hat eigenen, stärkeren Schatten */
    floatingHigh: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  });

export type Styles = ReturnType<typeof makeStyles>;

export function useStyles() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return { theme, styles };
}

/** Grün für Gewinn, Rot für Verlust, sonst neutral. */
export const signColor = (t: Theme, n: number | null) => (n === null || n === 0 ? t.text : n > 0 ? t.positive : t.negative);
