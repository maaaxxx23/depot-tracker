import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { dateTime, eur, pct, signedEur } from '../format';
import { PrivateText, usePrivacy } from '../privacy';
import { signColor, useStyles } from '../styles';

interface Props {
  value: number;
  gain: number;
  irr: number | null;
  periodLabel: string;
  updatedAt: Date;
  /** Gesetzt, wenn der Wert mit neueren Kursen geschätzt ist: Zeitpunkt des Bestands von comdirect */
  holdingsFrom: Date | null;
  /** Gewinn seit Kauf so, wie die Bank ihn rechnet (Wert − Einstandswert); null ohne Bankdaten */
  sinceBuy: { gain: number; rel: number } | null;
  onRefresh: () => void;
  /** Langer Druck auf den Depotwert: Besuchs-Banner als Vorschau zeigen */
  onPreviewVisit?: () => void;
}

/**
 * Kopf der Startseite, bewusst ruhig: Wert, eine kleine Stand-Zeile und knappe Kennzahlen.
 * Die Details (Yahoo-Schätzung, Einstand laut comdirect) stehen in Fußzeile und Hilfe.
 */
export function Hero({ value, gain, irr, periodLabel, updatedAt, holdingsFrom, sinceBuy, onRefresh, onPreviewVisit }: Props) {
  const { theme, styles } = useStyles();
  const { hidden, toggle } = usePrivacy();
  const gainStyle = [styles.number, { fontSize: 17, fontWeight: '600' as const, color: signColor(theme, irr) }];

  return (
    <View style={{ gap: 4 }}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text style={{ fontSize: 17, fontWeight: '600', color: theme.muted }}>Depot</Text>
        <View style={[styles.row, { gap: 14 }]}>
          <Pressable onPress={onRefresh} hitSlop={10} accessibilityLabel="Mit comdirect aktualisieren">
            <Ionicons name="refresh" size={21} color={theme.muted} />
          </Pressable>
          <Pressable onPress={toggle} hitSlop={10} accessibilityLabel={hidden ? 'Beträge zeigen' : 'Beträge verbergen'}>
            <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={22} color={theme.muted} />
          </Pressable>
        </View>
      </View>
      <Pressable onLongPress={onPreviewVisit} delayLongPress={500} disabled={!onPreviewVisit} style={{ alignSelf: 'flex-start' }}>
        <PrivateText style={[styles.number, { fontSize: 44, fontWeight: '700', color: theme.text, letterSpacing: -0.5 }]}>
          {`${holdingsFrom ? '≈ ' : ''}${eur(value)}`}
        </PrivateText>
      </Pressable>
      {/* Eine Zeile statt langer Erklärung; das „≈“ oben kennzeichnet die Schätzung */}
      <Text style={styles.small}>
        {holdingsFrom ? `Geschätzt · Kurse ${dateTime(updatedAt)} · Bestand ${dateTime(holdingsFrom)}` : `Stand ${dateTime(updatedAt)}`}
      </Text>
      <View style={[styles.row, { flexWrap: 'wrap' }]}>
        <PrivateText style={gainStyle}>{signedEur(gain)}</PrivateText>
        <Text style={gainStyle}> · {pct(irr)} p.a.</Text>
        <Text style={{ fontSize: 17, color: theme.muted }}>  {periodLabel}</Text>
      </View>
      {sinceBuy && (
        <View style={[styles.row, { flexWrap: 'wrap' }]}>
          <PrivateText style={[styles.small, styles.number, { fontWeight: '600', color: signColor(theme, sinceBuy.gain) }]}>{signedEur(sinceBuy.gain)}</PrivateText>
          <Text style={[styles.small, styles.number, { fontWeight: '600', color: signColor(theme, sinceBuy.gain) }]}> · {pct(sinceBuy.rel)}</Text>
          <Text style={styles.small}>  seit Kauf</Text>
        </View>
      )}
    </View>
  );
}
