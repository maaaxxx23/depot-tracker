import * as LocalAuthentication from 'expo-local-authentication';
import { ComponentRef, useEffect, useRef, useState } from 'react';
import { Alert, InputAccessoryView, Keyboard, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { clearCredentials, saveCredentials, Setup } from '../../comdirect/credentials';
import { applyCsv, exportBackup, importBackup, pickDepotCsv } from '../../data/backup';
import type { StoredPortfolio } from '../../data/backupFormat';
import { AppearanceMode, appLockPreference, autoLockPreference, clearStored, hapticsPreference } from '../../data/store';
import { useAppearance } from '../appearance';
import { setHapticsEnabled } from '../haptics';
import { eur, monthYear } from '../format';
import { Sheet } from '../Sheet';
import { tapFeedback } from '../haptics';
import { useStyles } from '../styles';
import { InfoDot } from './InfoDot';

type TextInputHandle = React.ComponentRef<typeof TextInput>;

interface Props {
  visible: boolean;
  setup: Setup | null;
  /** Tour-Finale: zum Schutz-Bereich scrollen und ihn mit Face-ID-Tipp hervorheben */
  highlightSchutz?: boolean;
  /** Beendet die Hervorhebung: Sperre wurde eingeschaltet oder „Später“ gewählt */
  onSchutzHighlightDone?: () => void;
  onClose: () => void;
  onSaved: (setup: Setup) => void;
  onDisconnected: () => void;
  onRestored: (stored: StoredPortfolio) => void;
  /** Monats-Rückblick zu Monatsbeginn zeigen; Einschalten holt einen ausgeblendeten zurück */
  reviewEnabled: boolean;
  onReviewEnabledChange: (on: boolean) => void;
}

const ACCESSORY_NEXT = 'connect-next';
const ACCESSORY_DONE = 'connect-done';

function KeyboardBar({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme } = useStyles();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', backgroundColor: theme.card, borderTopWidth: 0.5, borderTopColor: theme.muted }}>
      <Pressable onPress={onPress} hitSlop={8} style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
        <Text style={{ color: theme.accent, fontSize: 16, fontWeight: '600' }}>{label}</Text>
      </Pressable>
    </View>
  );
}

/** Einrichtung des comdirect-Zugangs; alles landet im iOS-Schlüsselbund. */
export function ConnectSheet({ visible, setup, highlightSchutz, onSchutzHighlightDone, onClose, onSaved, onDisconnected, onRestored, reviewEnabled, onReviewEnabledChange }: Props) {
  const { theme, styles } = useStyles();
  // Tour-Finale: nach dem Öffnen zum Schutz-Bereich scrollen
  const sheetScroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const schutzY = useRef(0);
  useEffect(() => {
    if (!visible || !highlightSchutz) return;
    const id = setTimeout(() => sheetScroll.current?.scrollTo({ y: Math.max(0, schutzY.current - 72), animated: true }), 550);
    return () => clearTimeout(id);
  }, [visible, highlightSchutz]);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  // Solange ein Zugang gespeichert ist, bleiben die Felder eingeklappt
  const [editing, setEditing] = useState(!setup);
  const secretRef = useRef<TextInputHandle>(null);
  const usernameRef = useRef<TextInputHandle>(null);
  const pinRef = useRef<TextInputHandle>(null);

  useEffect(() => {
    if (!visible) return;
    setClientId(setup?.clientId ?? '');
    setClientSecret(setup?.clientSecret ?? '');
    setUsername(setup?.username ?? '');
    setPin('');
    setEditing(!setup);
    appLockPreference.get().then(setLock).catch(() => {});
    autoLockPreference.get().then(setAutoLock).catch(() => {});
    hapticsPreference.get().then(setHaptics).catch(() => {});
  }, [visible, setup]);

  // Zugangsdaten (Client ID, Secret) erst nach Face ID bzw. Geräte-Code zeigen.
  // Nur wenn auf dem Gerät gar nichts eingerichtet ist, geht es direkt auf.
  const startEditing = async () => {
    const hardware = await LocalAuthentication.hasHardwareAsync().catch(() => false);
    const enrolled = hardware && (await LocalAuthentication.isEnrolledAsync().catch(() => false));
    if (enrolled) {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Zugangsdaten anzeigen' }).catch(() => ({ success: false }));
      if (!result.success) return;
    }
    setEditing(true);
  };

  // App-Sperre: vor dem Einschalten einmal entsperren, damit niemand sich selbst aussperrt
  const [lock, setLock] = useState(false);
  const toggleLock = async (on: boolean) => {
    if (on) {
      const hardware = await LocalAuthentication.hasHardwareAsync().catch(() => false);
      const enrolled = hardware && (await LocalAuthentication.isEnrolledAsync().catch(() => false));
      if (!hardware || !enrolled) {
        Alert.alert('Nicht eingerichtet', 'Richte zuerst Face ID oder einen Geräte-Code in den iOS-Einstellungen ein.');
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'App-Sperre einschalten' }).catch(() => ({ success: false }));
      if (!result.success) return;
    }
    setLock(on);
    appLockPreference.set(on).catch(() => {});
    // Tipp aus der Tour ist damit erledigt
    if (on && highlightSchutz) onSchutzHighlightDone?.();
  };

  // Darstellung: dem System folgen oder fest hell bzw. dunkel
  const { mode, setMode } = useAppearance();
  const APPEARANCE_CHOICES: { value: AppearanceMode; label: string }[] = [
    { value: 'system', label: 'Automatisch' },
    { value: 'light', label: 'Hell' },
    { value: 'dark', label: 'Dunkel' },
  ];

  // Haptisches Feedback beim Bestätigen; das Einschalten tickt zur Bestätigung gleich selbst
  const [haptics, setHaptics] = useState(true);
  const toggleHaptics = (on: boolean) => {
    setHaptics(on);
    setHapticsEnabled(on);
    if (on) tapFeedback();
  };

  // Auto-Sperre: Minuten ohne Berührung, nach denen sich die offene App selbst sperrt (0 = aus)
  const [autoLock, setAutoLock] = useState(0);
  const AUTO_LOCK_CHOICES = [0, 1, 5, 15];
  const chooseAutoLock = (minutes: number) => {
    tapFeedback();
    setAutoLock(minutes);
    autoLockPreference.set(minutes).catch(() => {});
  };

  // PIN/Passwort: comdirect erlaubt neben der klassischen 6-stelligen PIN auch längere
  // Passwörter mit Buchstaben – deshalb nur Mindestlänge prüfen, nichts wegfiltern
  const complete = clientId.trim() && clientSecret.trim() && /^\d{8}$/.test(username.trim()) && (setup || pin.length >= 6);

  const save = async () => {
    tapFeedback();
    setSaving(true);
    try {
      const next = { clientId: clientId.trim(), clientSecret: clientSecret.trim(), username: username.trim() };
      await saveCredentials(next, pin);
      onSaved(next);
    } catch (e) {
      // Technische Meldung mit anzeigen, damit sich die Ursache finden lässt (enthält keine Zugangsdaten)
      const reason = e instanceof Error ? e.message : String(e);
      Alert.alert('Speichern fehlgeschlagen', `Die Zugangsdaten konnten nicht im Schlüsselbund gespeichert werden.\n\n${reason}`);
    } finally {
      setSaving(false);
    }
  };

  const [busy, setBusy] = useState(false);
  const backup = async () => {
    setBusy(true);
    try {
      if (!(await exportBackup())) Alert.alert('Noch nichts zu sichern', 'Rufe zuerst einmal deine Daten von comdirect ab.');
    } catch (e) {
      Alert.alert('Sichern fehlgeschlagen', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    setBusy(true);
    try {
      const stored = await importBackup();
      if (!stored) return;
      onRestored(stored);
      Alert.alert('Wiederhergestellt', `Die Sicherung wurde mit dem aktuellen Stand zusammengeführt (${stored.raw.transactions.length} Umsätze).`);
    } catch (e) {
      Alert.alert('Wiederherstellen fehlgeschlagen', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const importCsv = async () => {
    setBusy(true);
    try {
      const preview = await pickDepotCsv();
      if (!preview) return;
      const { csv, added } = preview;
      const range = csv.from && csv.to ? ` (${monthYear(csv.from)} bis ${monthYear(csv.to)})` : '';
      let lines: string[];
      if (csv.kind === 'account') {
        if (csv.transactions.length === 0) {
          Alert.alert(
            'Keine Ausschüttungen gefunden',
            csv.unassigned > 0
              ? `${csv.unassigned} Buchungen ließen sich keinem Wertpapier zuordnen.`
              : 'In den Kontoumsätzen gibt es keine Ausschüttungen, Dividenden oder Vorabpauschalen.',
          );
          return;
        }
        lines = [
          `In der Datei${range}:`,
          csv.dividends > 0 ? `• ${csv.dividends} Ausschüttungen, zusammen ${eur(csv.total)} nach Steuern` : '',
          csv.prepaidTaxes > 0 ? `• ${csv.prepaidTaxes} × Steuer auf die Vorabpauschale, zusammen ${eur(csv.prepaidTaxTotal)} (nur zur Info, nicht in der Rendite)` : '',
          added > 0 ? `Neu für die App: ${added}. Der Rest ist schon bekannt.` : 'Alles ist schon bekannt.',
          csv.unassigned > 0 ? `${csv.unassigned} Buchungen ließen sich keinem Wertpapier zuordnen und werden übersprungen.` : '',
        ].filter(Boolean);
      } else {
        if (csv.transactions.length === 0) {
          Alert.alert('Keine Umsätze gefunden', 'Die Datei enthält keine lesbaren Käufe oder Verkäufe.');
          return;
        }
        lines = [
          `In der Datei: ${csv.buys} Käufe, ${csv.sells} Verkäufe${range}.`,
          added > 0 ? `Neu für die App: ${added}. Der Rest ist schon bekannt.` : 'Alle Umsätze sind schon bekannt.',
          csv.skipped > 0 ? `${csv.skipped} Zeilen waren nicht lesbar und werden übersprungen.` : '',
          csv.sells === 0 ? '' : 'Prüfe kurz, ob die Zahl der Verkäufe stimmt.',
        ].filter(Boolean);
      }
      if (added === 0) {
        Alert.alert('Nichts Neues', lines.join('\n\n'));
        return;
      }
      Alert.alert(csv.kind === 'account' ? 'Kontoumsätze übernehmen?' : 'Umsätze übernehmen?', lines.join('\n\n'), [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Übernehmen',
          onPress: async () => {
            try {
              onRestored(await applyCsv(preview));
            } catch (e) {
              Alert.alert('Import fehlgeschlagen', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ]);
    } catch (e) {
      Alert.alert('Import fehlgeschlagen', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const secondary = { flex: 1, backgroundColor: theme.chip, borderRadius: 10, paddingVertical: 11, alignItems: 'center' as const };
  const secondaryText = { color: theme.accent, fontSize: 15, fontWeight: '600' as const };

  const disconnect = () =>
    Alert.alert('Zugang löschen?', 'Zugangsdaten und gespeicherte Depotdaten werden von diesem iPhone entfernt. Sichere vorher deine Daten, wenn du die gesammelten Umsätze behalten willst.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await clearCredentials();
          await clearStored();
          onDisconnected();
        },
      },
    ]);

  const input = {
    backgroundColor: theme.card,
    color: theme.text,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  } as const;
  const field = (label: string, hint: string | null, node: React.ReactNode) => (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { fontWeight: '600' }]}>{label}</Text>
      {node}
      {hint ? <Text style={styles.small}>{hint}</Text> : null}
    </View>
  );

  return (
    <Sheet visible={visible} onClose={onClose} title="comdirect-Zugang" scrollRef={sheetScroll}>
      <Text style={[styles.label, { fontWeight: '600', paddingHorizontal: 4 }]}>Zugangsdaten</Text>
      {setup && !editing ? (
        /* Eingeklappt, solange ein Zugang gespeichert ist: nur Zusammenfassung und Knopf zum Ändern */
        <View style={[styles.card, { gap: 10 }]}>
          <Text style={styles.small}>
            Gespeichert für die Zugangsnummer ••••{setup.username.slice(-4)} – nur im Schlüsselbund dieses iPhones, die PIN
            mit Face ID geschützt. Die App liest nur.
          </Text>
          <Pressable onPress={startEditing} style={({ pressed }) => [secondary, { opacity: pressed ? 0.6 : 1 }]}>
            <Text style={secondaryText}>Zugangsdaten ändern</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={[styles.text, { color: theme.muted }]}>
            Client ID und Client Secret bekommst du, sobald du im comdirect-Onlinebanking den API-Zugang freigeschaltet hast.
            Alles wird nur im Schlüsselbund dieses iPhones gespeichert, die PIN zusätzlich mit Face ID geschützt. Die App liest
            nur und kann keine Aufträge erteilen.
          </Text>

          {field(
            'Client ID',
            null,
            <TextInput style={input} value={clientId} onChangeText={setClientId} autoCapitalize="none" autoCorrect={false} placeholder="User_…" placeholderTextColor={theme.muted} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => secretRef.current?.focus()} />,
          )}
          {field(
            'Client Secret',
            null,
            <TextInput ref={secretRef} style={input} value={clientSecret} onChangeText={setClientSecret} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="••••••••" placeholderTextColor={theme.muted} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => usernameRef.current?.focus()} />,
          )}
          {field(
            'Zugangsnummer',
            'Deine 8-stellige Zugangsnummer, mit der du dich auch auf comdirect.de und in der comdirect-App anmeldest',
            <TextInput ref={usernameRef} style={input} value={username} onChangeText={(v) => setUsername(v.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" textContentType="username" inputAccessoryViewID={ACCESSORY_NEXT} />,
          )}
          {field(
            'PIN',
            setup ? 'Leer lassen, um die gespeicherte PIN zu behalten' : 'Deine Onlinebanking-PIN bzw. dein Passwort von comdirect.de; wird mit Face ID geschützt',
            <TextInput
              ref={pinRef}
              style={input}
              value={pin}
              // Nur Leerzeichen und Zeilenumbrüche entfernen (Reste vom Einfügen); Buchstaben
              // und Sonderzeichen gehören bei comdirect-Passwörtern dazu
              onChangeText={(v) => setPin(v.replace(/\s/g, '').slice(0, 64))}
              keyboardType="default"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              textContentType="password"
              inputAccessoryViewID={ACCESSORY_DONE}
            />,
          )}

          {/* Der Ziffernblock hat keine Eingabetaste: Leiste über der Tastatur für Weiter/Fertig */}
          {Platform.OS === 'ios' && (
            <>
              <InputAccessoryView nativeID={ACCESSORY_NEXT}>
                <KeyboardBar label="Weiter" onPress={() => pinRef.current?.focus()} />
              </InputAccessoryView>
              <InputAccessoryView nativeID={ACCESSORY_DONE}>
                <KeyboardBar label="Fertig" onPress={() => Keyboard.dismiss()} />
              </InputAccessoryView>
            </>
          )}

          <Pressable
            disabled={!complete || saving}
            onPress={save}
            style={({ pressed }) => ({ backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: !complete || saving ? 0.4 : pressed ? 0.7 : 1 })}
          >
            <Text style={{ color: theme.onAccent, fontSize: 16, fontWeight: '600' }}>Speichern</Text>
          </Pressable>
        </>
      )}

      <Text onLayout={(e) => (schutzY.current = e.nativeEvent.layout.y)} style={[styles.label, { fontWeight: '600', paddingHorizontal: 4, marginTop: 8 }]}>Schutz</Text>
      <View style={[styles.card, { gap: 10 }, highlightSchutz && { borderWidth: 2, borderColor: theme.accent }]}>
        {highlightSchutz && (
          <View style={{ gap: 6 }}>
            <Text style={[styles.small, { color: theme.accent, fontWeight: '600' }]}>
              Tipp aus der Tour: Schalte die Sperre am besten gleich ein – sie schützt App und Zugang mit Face ID.
            </Text>
            <Pressable onPress={onSchutzHighlightDone} hitSlop={6} accessibilityRole="button" style={({ pressed }) => ({ alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 })}>
              <Text style={[styles.small, { color: theme.muted, fontWeight: '600' }]}>Später</Text>
            </Pressable>
          </View>
        )}
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <Text style={[styles.label, { fontWeight: '600' }]}>Mit Face ID sperren</Text>
          <Switch value={lock} onValueChange={toggleLock} />
        </View>
        <Text style={styles.small}>
          Beim Öffnen und nach einem App-Wechsel verlangt die App Face ID; im App-Wechsler zeigt sie nur ihr Symbol.
        </Text>
        {lock && (
          <>
            <Text style={[styles.label, { fontWeight: '600', marginTop: 4 }]}>Automatisch sperren</Text>
            <View style={[styles.row, { gap: 8 }]}>
              {AUTO_LOCK_CHOICES.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => chooseAutoLock(m)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: autoLock === m }}
                  accessibilityLabel={m === 0 ? 'Auto-Sperre aus' : `Automatisch sperren nach ${m} Minuten`}
                  style={({ pressed }) => ({
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 10,
                    alignItems: 'center',
                    backgroundColor: autoLock === m ? theme.accent : theme.chip,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ color: autoLock === m ? theme.onAccent : theme.text, fontSize: 14, fontWeight: '600' }}>{m === 0 ? 'Aus' : `${m} Min.`}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </View>

      <Text style={[styles.label, { fontWeight: '600', paddingHorizontal: 4, marginTop: 8 }]}>Darstellung</Text>
      <View style={[styles.card, { gap: 10 }]}>
        <View style={[styles.row, { gap: 8 }]}>
          {APPEARANCE_CHOICES.map((c) => (
            <Pressable
              key={c.value}
              onPress={() => {
                tapFeedback();
                setMode(c.value);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === c.value }}
              accessibilityLabel={`Darstellung ${c.label}`}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 8,
                borderRadius: 10,
                alignItems: 'center',
                backgroundColor: mode === c.value ? theme.accent : theme.chip,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ color: mode === c.value ? theme.onAccent : theme.text, fontSize: 14, fontWeight: '600' }}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.small}>„Automatisch“ folgt der iOS-Einstellung.</Text>
        <View style={[styles.row, styles.divider, { justifyContent: 'space-between', paddingTop: 10 }]}>
          <Text style={[styles.label, { fontWeight: '600' }]}>Haptisches Feedback</Text>
          <Switch value={haptics} onValueChange={toggleHaptics} />
        </View>
        <View style={[styles.row, styles.divider, { justifyContent: 'space-between', gap: 12, paddingTop: 10 }]}>
          <View style={{ flexShrink: 1, gap: 2 }}>
            <Text style={[styles.label, { fontWeight: '600' }]}>Monats-Rückblick</Text>
            <Text style={styles.small}>Karte zum Vormonat in den ersten Tagen des Monats</Text>
          </View>
          <Switch
            value={reviewEnabled}
            onValueChange={(on) => {
              tapFeedback();
              onReviewEnabledChange(on);
            }}
          />
        </View>
      </View>

      {/* Sicherung: gesammelte Umsätze überstehen so auch ein Löschen der App */}
      <Text style={[styles.label, { fontWeight: '600', paddingHorizontal: 4, marginTop: 8 }]}>Daten sichern</Text>
      <View style={[styles.card, { gap: 10 }]}>
        <Text style={styles.small}>
          comdirect liefert nur ein halbes Jahr Umsätze – die Sicherung bewahrt alles Gesammelte samt Einstellungen und
          ETF-Listen, ohne Zugangsdaten.
        </Text>
        <View style={[styles.row, { gap: 10 }]}>
          <Pressable onPress={backup} disabled={busy} style={({ pressed }) => [secondary, { opacity: busy ? 0.4 : pressed ? 0.6 : 1 }]}>
            <Text style={secondaryText}>Sichern</Text>
          </Pressable>
          <Pressable onPress={restore} disabled={busy} style={({ pressed }) => [secondary, { opacity: busy ? 0.4 : pressed ? 0.6 : 1 }]}>
            <Text style={secondaryText}>Wiederherstellen</Text>
          </Pressable>
        </View>
      </View>

      {/* Ältere Umsätze: die Schnittstelle liefert nur etwa ein halbes Jahr, der Export auf comdirect.de bis zu 540 Tage */}
      <View style={[styles.row, { gap: 6, paddingHorizontal: 4, marginTop: 8 }]}>
        <Text style={[styles.label, { fontWeight: '600' }]}>Umsätze importieren</Text>
        <InfoDot
          title="Umsätze importieren"
          text={
            'Ältere Käufe und Verkäufe findest du auf comdirect.de unter Depot → Depotumsätze, Ausschüttungen und Dividenden unter den Umsätzen des Verrechnungskontos.\n\nJeweils den Zeitraum so weit wie möglich zurückstellen, unten „Export als csv“ wählen und die Datei hier auswählen. Die App erkennt die Art der Datei selbst; Bekanntes wird nicht doppelt gezählt.'
          }
        />
      </View>
      <View style={[styles.card, { gap: 10 }]}>
        <Text style={styles.small}>Holt ältere Umsätze aus dem CSV-Export von comdirect.de in die App.</Text>
        <Pressable onPress={importCsv} disabled={busy} style={({ pressed }) => [secondary, { opacity: busy ? 0.4 : pressed ? 0.6 : 1 }]}>
          <Text style={secondaryText}>CSV-Datei auswählen</Text>
        </Pressable>
      </View>

      {setup && (
        <Pressable onPress={disconnect} style={{ paddingVertical: 12, alignItems: 'center' }}>
          <Text style={{ color: theme.negative, fontSize: 15, fontWeight: '600' }}>Zugang löschen</Text>
        </Pressable>
      )}
    </Sheet>
  );
}
