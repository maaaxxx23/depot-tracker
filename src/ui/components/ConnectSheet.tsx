import { useEffect, useRef, useState } from 'react';
import { Alert, InputAccessoryView, Keyboard, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { clearCredentials, saveCredentials, Setup } from '../../comdirect/credentials';
import { applyCsv, exportBackup, importBackup, pickDepotCsv } from '../../data/backup';
import type { StoredPortfolio } from '../../data/backupFormat';
import { clearStored } from '../../data/store';
import { eur, monthYear } from '../format';
import { Sheet } from '../Sheet';
import { useStyles } from '../styles';

type TextInputHandle = React.ComponentRef<typeof TextInput>;

interface Props {
  visible: boolean;
  setup: Setup | null;
  onClose: () => void;
  onSaved: (setup: Setup) => void;
  onDisconnected: () => void;
  onRestored: (stored: StoredPortfolio) => void;
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
export function ConnectSheet({ visible, setup, onClose, onSaved, onDisconnected, onRestored }: Props) {
  const { theme, styles } = useStyles();
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
  }, [visible, setup]);

  const complete = clientId.trim() && clientSecret.trim() && /^\d{8}$/.test(username.trim()) && (setup || /^\d{6}$/.test(pin));

  const save = async () => {
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
    <Sheet visible={visible} onClose={onClose} title="comdirect-Zugang">
      <Text style={[styles.label, { fontWeight: '600', paddingHorizontal: 4 }]}>Zugangsdaten</Text>
      {setup && !editing ? (
        /* Eingeklappt, solange ein Zugang gespeichert ist: nur Zusammenfassung und Knopf zum Ändern */
        <View style={[styles.card, { gap: 10 }]}>
          <Text style={styles.small}>
            Gespeichert für die Zugangsnummer ••••{setup.username.slice(-4)} – nur im Schlüsselbund dieses iPhones, die PIN
            zusätzlich mit Face ID geschützt. Die App liest nur und kann keine Aufträge erteilen.
          </Text>
          <Pressable onPress={() => setEditing(true)} style={({ pressed }) => [secondary, { opacity: pressed ? 0.6 : 1 }]}>
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
            setup ? 'Leer lassen, um die gespeicherte PIN zu behalten' : 'Deine 6-stellige Onlinebanking-PIN von comdirect.de; wird mit Face ID geschützt',
            <TextInput ref={pinRef} style={input} value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" secureTextEntry textContentType="password" inputAccessoryViewID={ACCESSORY_DONE} />,
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
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Speichern</Text>
          </Pressable>
        </>
      )}

      {/* Sicherung: gesammelte Umsätze überstehen so auch ein Löschen der App */}
      <Text style={[styles.label, { fontWeight: '600', paddingHorizontal: 4, marginTop: 8 }]}>Daten sichern</Text>
      <View style={[styles.card, { gap: 10 }]}>
        <Text style={styles.small}>
          comdirect liefert nur etwa ein halbes Jahr an Umsätzen. Die App sammelt sie bei jedem Abruf; mit einer Sicherung in
          iCloud Drive bleiben sie auch nach dem Löschen der App erhalten. Die Datei enthält deine Depotdaten und
          Einstellungen (Ziel, Rendite, Sparpläne), aber keine Zugangsdaten.
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
      <Text style={[styles.label, { fontWeight: '600', paddingHorizontal: 4, marginTop: 8 }]}>Umsätze importieren</Text>
      <View style={[styles.card, { gap: 10 }]}>
        <Text style={styles.small}>
          Ältere Käufe und Verkäufe: auf comdirect.de unter Depot → Depotumsätze. Ausschüttungen und Dividenden: unter den
          Umsätzen des Verrechnungskontos. Jeweils den Zeitraum so weit wie möglich zurückstellen, unten „Export als csv“ wählen
          und die Datei hier auswählen. Die App erkennt die Art der Datei selbst; Bekanntes wird nicht doppelt gezählt.
        </Text>
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
