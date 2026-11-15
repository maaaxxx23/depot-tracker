import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from 'react-native';
import type { Challenge } from '../../comdirect/api';
import { loadPin, Setup } from '../../comdirect/credentials';
import type { ComdirectLogin } from '../../comdirect/login';
import { beginLogin, finishLogin, WARN_OPEN_CHALLENGES } from '../../comdirect/sync';
import { openChallenges } from '../../data/store';
import type { StoredPortfolio } from '../../data/store';
import { tapFeedback } from '../haptics';
import { Sheet } from '../Sheet';
import { useStyles } from '../styles';

type Phase = 'connecting' | 'challenge' | 'loading' | 'error';

interface Props {
  visible: boolean;
  setup: Setup;
  onClose: () => void;
  onSynced: (stored: StoredPortfolio) => void;
}

/** Anmeldung bei comdirect mit Session-TAN und anschließender Datenabruf. */
export function LoginSheet({ visible, setup, onClose, onSynced }: Props) {
  const { theme, styles } = useStyles();
  const [phase, setPhase] = useState<Phase>('connecting');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [tan, setTan] = useState('');
  const [error, setError] = useState('');
  const [openCount, setOpenCount] = useState(0);
  const login = useRef<ComdirectLogin | null>(null);
  const completing = useRef(false);
  const poll = useRef<AbortController | null>(null);

  const fail = (e: unknown) => {
    setError(e instanceof Error ? e.message : 'Unbekannter Fehler.');
    setPhase('error');
  };

  const complete = async (withTan?: string) => {
    if (!login.current || completing.current) return;
    completing.current = true;
    poll.current?.abort();
    try {
      setPhase('loading');
      onSynced(await finishLogin(login.current, withTan));
    } catch (e) {
      fail(e);
    }
  };

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setPhase('connecting');
    setChallenge(null);
    setTan('');
    setError('');
    completing.current = false;

    (async () => {
      const pin = await loadPin();
      if (cancelled) return;
      if (!pin) throw new Error('Die PIN wurde nicht freigegeben. Hinterlege sie unter „comdirect-Zugang“ neu, falls sie fehlt.');
      const started = await beginLogin({ ...setup, pin });
      if (cancelled) {
        await started.login.cancel();
        return;
      }
      setOpenCount(await openChallenges.get());
      login.current = started.login;
      setChallenge(started.challenge);
      setPhase('challenge');
      if (started.challenge.typ === 'P_TAN_PUSH') {
        poll.current = new AbortController();
        if (await started.login.waitForPush(poll.current.signal)) complete();
      }
    })().catch((e) => !cancelled && fail(e));

    return () => {
      cancelled = true;
      poll.current?.abort();
    };
    // Bewusst nur beim Öffnen: jede Anmeldung fordert genau eine TAN an
  }, [visible]);

  const close = () => {
    poll.current?.abort();
    if (!completing.current) login.current?.cancel();
    login.current = null;
    onClose();
  };

  const button = (label: string, onPress: () => void, disabled = false) => (
    <Pressable
      disabled={disabled}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => ({ backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}
    >
      <Text style={{ color: theme.onAccent, fontSize: 16, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );

  const busy = (text: string) => (
    <View style={[styles.card, { alignItems: 'center', paddingVertical: 32 }]}>
      <ActivityIndicator color={theme.accent} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );

  const tanEntry = (
    <TextInput
      value={tan}
      onChangeText={(v) => setTan(v.replace(/\D/g, '').slice(0, 6))}
      keyboardType="number-pad"
      textContentType="oneTimeCode"
      placeholder="TAN"
      placeholderTextColor={theme.muted}
      style={{ backgroundColor: theme.card, color: theme.text, borderRadius: 12, padding: 14, fontSize: 22, letterSpacing: 6, textAlign: 'center' }}
    />
  );

  return (
    <Sheet visible={visible} onClose={close} title="Mit comdirect aktualisieren">
      {phase === 'connecting' && busy('Verbinde mit comdirect …')}
      {phase === 'loading' && busy('Freigabe wird bestätigt, Depot wird geladen …')}

      {phase === 'challenge' && challenge?.typ === 'P_TAN_PUSH' && (
        <>
          <View style={[styles.card, { alignItems: 'center', paddingVertical: 28 }]}>
            <Ionicons name="phone-portrait-outline" size={36} color={theme.accent} />
            <Text style={[styles.cardTitle, { textAlign: 'center' }]}>Bitte in der photoTAN-App freigeben</Text>
            <Text style={[styles.text, { color: theme.muted, textAlign: 'center' }]}>
              Öffne die Push-Nachricht auf diesem iPhone, gib die Anmeldung frei und komm hierher zurück.
            </Text>
            <ActivityIndicator color={theme.muted} />
          </View>
          {button('Ich habe freigegeben', () => complete())}
        </>
      )}

      {phase === 'challenge' && challenge?.typ === 'P_TAN' && (
        <>
          <View style={[styles.card, { alignItems: 'center' }]}>
            <Text style={styles.text}>Scanne die Grafik mit der photoTAN-App und gib die TAN ein.</Text>
            {challenge.challenge ? (
              <Image source={{ uri: `data:image/png;base64,${challenge.challenge}` }} style={{ width: 220, height: 220 }} resizeMode="contain" />
            ) : null}
          </View>
          {tanEntry}
          {button('Bestätigen', () => complete(tan), tan.length < 6)}
        </>
      )}

      {phase === 'challenge' && challenge && challenge.typ !== 'P_TAN_PUSH' && challenge.typ !== 'P_TAN' && (
        <>
          <View style={styles.card}>
            <Text style={styles.text}>
              Gib die TAN ein, die comdirect {challenge.challenge ? `an ${challenge.challenge}` : 'dir'} geschickt hat.
            </Text>
          </View>
          {tanEntry}
          {button('Bestätigen', () => complete(tan), tan.length < 6)}
        </>
      )}

      {phase === 'error' && (
        <>
          <View style={[styles.card, { flexDirection: 'row', gap: 10 }]}>
            <Ionicons name="alert-circle" size={22} color={theme.negative} />
            <Text style={[styles.text, { flex: 1 }]}>{error}</Text>
          </View>
          {button('Schließen', close)}
        </>
      )}

      {(phase === 'challenge' || phase === 'error') && (
        <Text style={[styles.small, { lineHeight: 17, paddingHorizontal: 4 }]}>
          {openCount >= WARN_OPEN_CHALLENGES ? `Achtung: Bereits ${openCount} TAN-Anfragen ohne Freigabe. ` : ''}
          comdirect sperrt den Zugang nach fünf TAN-Anfragen ohne korrekte TAN oder nach drei falschen TANs. Probiere bei Fehlern
          deshalb nicht mehrfach hintereinander.
        </Text>
      )}
    </Sheet>
  );
}
