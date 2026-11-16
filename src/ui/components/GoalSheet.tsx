import { useEffect, useState } from 'react';
import { Alert, Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { withdrawalPreference } from '../../data/store';
import { tapFeedback } from '../haptics';
import { corridorMonths, GoalProjection, MAX_RETURN, projectGoal, projectSeries, RETURN_STEP, Savings } from '../../finance/savings';
import { LineChart } from '../LineChart';
import {
  capitalToConsume,
  capitalToPreserve,
  CONSUME_YEARS_DEFAULT,
  CONSUME_YEARS_MAX,
  CONSUME_YEARS_MIN,
  CONSUME_YEARS_STEP,
  monthlyFromCapital,
  roundCapital,
} from '../../finance/withdrawal';
import type { PositionResult } from '../../finance/performance';
import type { Instrument } from '../../types';
import { compactEur, dayMonth, eur, monthName, monthYear, pct, percent, shortPercent } from '../format';
import { usePrivacy } from '../privacy';
import { Sheet } from '../Sheet';
import { font, radius, useStyles } from '../styles';
import { DetailRow, DetailRows } from './DetailRows';
import { InfoDot } from './InfoDot';
import { positionColor } from './PositionList';

interface Props {
  visible: boolean;
  onClose: () => void;
  savings: Savings;
  instruments: Instrument[];
  goal: number | null;
  projection: GoalProjection | null;
  /** null entfernt das Ziel */
  onChangeGoal: (goal: number | null) => void;
  /** Angenommene Rendite pro Jahr für die Hochrechnung */
  annualReturn: number;
  onChangeReturn: (rate: number) => void;
  /** Bisherige Rendite des Depots pro Jahr, zum Vergleich und als eigene Linie im Korridor */
  historicReturn: number | null;
  /** Name und langjähriger Durchschnitt des Vergleichsindex; null, wenn es keinen gibt */
  benchmarkName: string | null;
  benchmarkAverage: number | null;
  /** Heutiger Depotwert, für die Entnahme-Modellrechnung */
  currentValue: number;
  /** Stichtag der Daten, als Startpunkt des Korridor-Diagramms */
  asOf: string;
  /** Positionen in der Reihenfolge der Startseite, für die Farben der Sparpläne */
  positions: PositionResult[];
}

/** Wunschbetrag festlegen, dazu die erkannten Sparpläne, die Hochrechnung und die Entnahme-Modellrechnung. */
export function GoalSheet({ visible, onClose, savings, instruments, goal, projection, onChangeGoal, annualReturn, onChangeReturn, historicReturn, benchmarkName, benchmarkAverage, currentValue, asOf, positions }: Props) {
  const { theme, styles } = useStyles();
  const { hidden } = usePrivacy();
  const [input, setInput] = useState('');

  // Im Privatsphäre-Modus bleibt das Feld leer, damit der Betrag nicht lesbar ist
  useEffect(() => {
    if (visible) setInput(goal && !hidden ? String(Math.round(goal)) : '');
  }, [visible, goal, hidden]);

  // Wunsch-Entnahme: gespeicherter Wert plus Eingabefeld (im Privatsphäre-Modus leer, wie oben)
  const [draw, setDraw] = useState('');
  const [storedDraw, setStoredDraw] = useState<number | null>(null);
  const [years, setYears] = useState(CONSUME_YEARS_DEFAULT);
  useEffect(() => {
    if (!visible) return;
    withdrawalPreference
      .get()
      .then((w) => {
        setStoredDraw(w ? w.monthly : null);
        setYears(w?.years ?? CONSUME_YEARS_DEFAULT);
        setDraw(w && !hidden ? String(Math.round(w.monthly)) : '');
      })
      .catch(() => {});
  }, [visible, hidden]);

  const changeDraw = (v: string) => {
    const text = v.replace(/\D/g, '').slice(0, 6);
    setDraw(text);
    const n = Number(text);
    setStoredDraw(n > 0 ? n : null);
    withdrawalPreference.set(n > 0 ? { monthly: n, years } : null).catch(() => {});
  };
  // Im Privatsphäre-Modus rechnet die App mit dem gespeicherten Wert weiter, ohne ihn zu zeigen
  const drawMonthly = hidden && draw === '' ? storedDraw ?? 0 : Number(draw) || 0;
  const setYearsClamped = (v: number) => {
    const next = Math.min(CONSUME_YEARS_MAX, Math.max(CONSUME_YEARS_MIN, Math.round(v)));
    setYears(next);
    if (drawMonthly > 0) withdrawalPreference.set({ monthly: drawMonthly, years: next }).catch(() => {});
  };
  // Antippen der Jahreszahl: genaues Jahr eingeben, auch zwischen den 5er-Schritten
  const askYears = () => {
    Alert.prompt(
      'Verzehr-Dauer',
      `Jahre zwischen ${CONSUME_YEARS_MIN} und ${CONSUME_YEARS_MAX}`,
      (text) => {
        const n = Number((text ?? '').replace(/\D/g, ''));
        if (n > 0) setYearsClamped(n);
      },
      'plain-text',
      String(years),
      'number-pad',
    );
  };
  const preserve = capitalToPreserve(drawMonthly, annualReturn);
  const consume = capitalToConsume(drawMonthly, annualReturn, years);

  /**
   * Übernehmen-Knopf im Auswahl-Stil: Der Betrag, der gerade das gespeicherte Ziel ist,
   * füllt seinen Knopf blau – wie bei einer gewählten Option. Beim Drücken gibt es ein
   * feines haptisches Tick.
   */
  const adoptButton = (label: string, capital: number, accessibility: string) => {
    const adopted = goal !== null && Math.round(goal) === roundCapital(capital);
    return (
      <Pressable
        onPress={() => {
          tapFeedback();
          onChangeGoal(roundCapital(capital));
        }}
        accessibilityRole="button"
        accessibilityLabel={accessibility}
        accessibilityState={{ selected: adopted }}
        style={({ pressed }) => ({
          flex: 1,
          backgroundColor: adopted ? theme.accent : 'transparent',
          borderColor: theme.accent,
          borderWidth: 1,
          borderRadius: radius.button,
          paddingVertical: 13,
          paddingHorizontal: 10,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text style={{ color: adopted ? theme.onAccent : theme.accent, fontSize: font.body, fontWeight: '600', textAlign: 'center' }}>{label}</Text>
      </Pressable>
    );
  };

  const entered = Number(input);
  const valid = entered >= 100;
  // Der eingetragene Betrag ist schon das gespeicherte Ziel: nichts zu übernehmen
  const unchanged = goal !== null && entered === Math.round(goal);
  const save = () => {
    Keyboard.dismiss();
    tapFeedback();
    onChangeGoal(entered);
  };

  // Dieselbe Farbe wie in der Positionen-Karte auf der Startseite
  const colorFor = (isin: string) => {
    const index = positions.findIndex((p) => p.instrument.isin === isin);
    return index >= 0 ? positionColor(theme, index) : undefined;
  };
  const planRows: DetailRow[] = savings.plans.map((p) => ({
    label: instruments.find((i) => i.isin === p.isin)?.shortName ?? p.isin,
    labelColor: colorFor(p.isin),
    hint: p.source === 'auto' ? 'pro Monat · automatisch erkannt' : `von dir markiert · letzter Kauf am ${dayMonth(p.lastBuy)}`,
    value: eur(p.rate),
    private: true,
  }));
  const name = (isin: string) => instruments.find((i) => i.isin === isin)?.shortName ?? isin;
  const inactiveRows: DetailRow[] = savings.inactive.map((p) => ({
    label: name(p.isin),
    hint: p.lastBuy ? `markiert, aber seit ${monthYear(p.lastBuy)} kein Kauf mehr` : 'markiert, aber noch kein Kauf',
    value: '–',
    color: theme.warn,
  }));
  const step = (delta: number) => onChangeReturn(Math.min(MAX_RETURN, Math.max(0, Math.round((annualReturn + delta) / RETURN_STEP) * RETURN_STEP)));
  const stepButton = (icon: 'remove' | 'add', delta: number, disabled: boolean) => (
    <Pressable
      onPress={() => step(delta)}
      disabled={disabled}
      hitSlop={8}
      accessibilityLabel={icon === 'add' ? 'Rendite erhöhen' : 'Rendite senken'}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.chip, opacity: disabled ? 0.35 : pressed ? 0.6 : 1 })}
    >
      <Ionicons name={icon} size={22} color={theme.text} />
    </Pressable>
  );
  // Korridor-Diagramm: deine Annahme in Gold, dazu echte Vergleichswerte –
  // die bisherige Depot-Rendite (grau) und der langjährige Index-Schnitt (blau)
  const corridor = (() => {
    if (!projection || !goal || projection.remaining <= 0 || currentValue <= 0) return null;
    const extra = [
      ...(historicReturn !== null ? [{ rate: historicReturn, color: theme.invested }] : []),
      ...(benchmarkAverage !== null ? [{ rate: benchmarkAverage, color: theme.benchmark }] : []),
    ];
    const months = corridorMonths(currentValue, goal, savings.monthlyRate, [annualReturn, ...extra.map((e) => e.rate)]);
    const start = Number(asOf.slice(0, 4)) * 12 + Number(asOf.slice(5, 7)) - 1;
    const dates = Array.from({ length: months + 1 }, (_, m) => {
      const index = start + m;
      return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;
    });
    const line = (rate: number) => projectSeries(currentValue, goal, savings.monthlyRate, rate, months);
    return {
      dates,
      series: [
        // Durchgezogen statt gestrichelt: Strichelung rendert auf langen Kurven lückenhaft
        ...extra.map((e) => ({ values: line(e.rate), color: e.color, width: 1.4 })),
        // Die Annahme-Linie zuletzt und kräftiger, damit sie obenauf liegt
        { values: line(annualReturn), color: theme.accent },
      ],
    };
  })();
  // Zeitpunkt, zu dem das Ziel mit einer bestimmten Rendite erreicht wäre
  const scenarioMonth = (rate: number) => (goal ? projectGoal(currentValue, goal, savings.monthlyRate, asOf, rate).withReturn : null);

  // Was-wäre-wenn: ein Monat je Szenario; „erreicht“, sobald das Ziel schon steht
  const when = (month: string | null) => (projection && projection.remaining <= 0 ? 'erreicht' : month ? monthName(month) : 'über 50 Jahre');
  const projectionRows: DetailRow[] = projection
    ? [
        { label: 'Erreicht', value: percent(projection.progress) },
        { label: 'Es fehlen noch', value: eur(projection.remaining), private: true },
        // Die Zeilen tragen die Farben ihrer Linien im Diagramm darüber
        {
          label: `Mit ${shortPercent(annualReturn)} Rendite im Jahr`,
          labelColor: theme.accent,
          hint: 'deine Annahme, kein Versprechen',
          value: when(projection.withReturn),
        },
        // Echte Vergleichswerte statt erfundener Szenarien: so lief es bisher bzw. langfristig
        ...(projection.remaining > 0 && historicReturn !== null
          ? [{ label: `Mit deiner bisherigen Rendite (${shortPercent(historicReturn)})`, labelColor: theme.invested, hint: 'Depot pro Jahr seit Beginn', value: when(scenarioMonth(historicReturn)) }]
          : []),
        ...(projection.remaining > 0 && benchmarkName && benchmarkAverage !== null
          ? [{ label: `Mit dem ${benchmarkName}-Schnitt (${shortPercent(benchmarkAverage)})`, labelColor: theme.benchmark, hint: 'Durchschnitt der geladenen Kurshistorie', value: when(scenarioMonth(benchmarkAverage)) }]
          : []),
        {
          label: 'Ohne Kursgewinne',
          hint: 'nur durch deine Sparrate',
          value: projection.remaining <= 0 ? 'erreicht' : projection.withoutReturn ? monthName(projection.withoutReturn) : '–',
        },
      ]
    : [];

  return (
    <Sheet visible={visible} onClose={onClose} title="Sparen & Ziel">
      <View style={[styles.card, { gap: 10 }]}>
        <Text style={[styles.label, { fontWeight: '600' }]}>Wunschbetrag für dein Depot</Text>
        <View style={[styles.row, { gap: 10 }]}>
          <TextInput
            style={{ flex: 1, backgroundColor: theme.background, color: theme.text, borderRadius: radius.button, paddingHorizontal: 14, paddingVertical: 12, fontSize: font.button }}
            value={input}
            onChangeText={(v) => setInput(v.replace(/\D/g, '').slice(0, 9))}
            keyboardType="number-pad"
            placeholder={goal && hidden ? 'Betrag ausgeblendet' : 'z. B. 100000'}
            placeholderTextColor={theme.muted}
          />
          <Text style={[styles.text, { color: theme.muted }]}>€</Text>
        </View>
        <Pressable
          disabled={!valid || unchanged}
          onPress={save}
          style={({ pressed }) => ({ backgroundColor: unchanged ? theme.chip : theme.accent, borderRadius: radius.button, paddingVertical: 14, alignItems: 'center', opacity: !valid && !unchanged ? 0.4 : pressed ? 0.7 : 1 })}
        >
          <Text style={{ color: unchanged ? theme.muted : theme.onAccent, fontSize: font.button, fontWeight: '600' }}>{unchanged ? 'Ziel gesetzt' : goal ? 'Ziel ändern' : 'Ziel festlegen'}</Text>
        </Pressable>
        {goal ? (
          <Pressable onPress={() => onChangeGoal(null)} style={{ paddingVertical: 6, alignItems: 'center' }}>
            <Text style={{ color: theme.negative, fontSize: font.body, fontWeight: '600' }}>Ziel entfernen</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.card, { gap: 10 }]}>
        <Text style={[styles.label, { fontWeight: '600' }]}>Angenommene Rendite im Jahr</Text>
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          {stepButton('remove', -RETURN_STEP, annualReturn <= 1e-9)}
          <Text style={[styles.number, { fontSize: font.stat, fontWeight: '700', color: theme.text }]}>{shortPercent(annualReturn)}</Text>
          {stepButton('add', RETURN_STEP, annualReturn >= MAX_RETURN - 1e-9)}
        </View>
        <Text style={styles.small}>
          Aktien-ETFs brachten langfristig etwa 5 bis 7 % im Jahr.
          {historicReturn !== null ? ` Dein Depot bisher: ${pct(historicReturn)}.` : ''}
        </Text>
      </View>

      {projectionRows.length > 0 && (
        <>
          <Text style={[styles.label, { fontWeight: '600', paddingHorizontal: 4, marginTop: 8 }]}>Hochrechnung</Text>
          {corridor && (
            <View style={[styles.card, { gap: 6 }]}>
              <LineChart theme={theme} height={150} dates={corridor.dates} series={corridor.series} formatY={compactEur} blurValues={hidden} />
              <Text style={styles.small}>
                Gold: deine Annahme ({shortPercent(annualReturn)})
                {historicReturn !== null ? ` · Grau: Depot bisher (${shortPercent(historicReturn)})` : ''}
                {benchmarkName && benchmarkAverage !== null ? ` · Blau: ${benchmarkName}-Schnitt (${shortPercent(benchmarkAverage)})` : ''}. Jede
                Linie endet, wenn sie den Wunschbetrag erreicht.
              </Text>
            </View>
          )}
          <DetailRows rows={projectionRows} />
        </>
      )}

      <View style={[styles.row, { gap: 6, paddingHorizontal: 4, marginTop: 8 }]}>
        <Text style={[styles.label, { fontWeight: '600' }]}>Entnahme</Text>
        <InfoDot
          title="Entnahme"
          text={
            'Eine grobe Modellrechnung mit deiner angenommenen Rendite, ohne Steuern und Inflation: Auf Gewinne gehen bei der Entnahme meist rund 26 % Steuern ab, und schwache erste Jahre können den Verzehr deutlich verkürzen.\n\nOb und wie viel du entnimmst, entscheidest du – die App gibt keine Empfehlung.'
          }
        />
      </View>
      <View style={[styles.card, { gap: 10 }]}>
        <Text style={[styles.text, { color: theme.muted }]}>
          Wie groß müsste dein Depot sein, damit es dir jeden Monat einen Wunschbetrag auszahlt?
        </Text>
        <View style={[styles.row, { gap: 10 }]}>
          <TextInput
            style={{ flex: 1, backgroundColor: theme.background, color: theme.text, borderRadius: radius.button, paddingHorizontal: 14, paddingVertical: 12, fontSize: font.button }}
            value={draw}
            onChangeText={changeDraw}
            keyboardType="number-pad"
            placeholder={storedDraw && hidden ? 'Betrag ausgeblendet' : 'z. B. 1500'}
            placeholderTextColor={theme.muted}
            accessibilityLabel="Wunsch-Entnahme im Monat in Euro"
          />
          <Text style={[styles.text, { color: theme.muted }]}>€ im Monat</Text>
        </View>
        {drawMonthly > 0 && (
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text style={styles.text}>Verzehr-Dauer</Text>
            <View style={[styles.row, { gap: 12 }]}>
              <Pressable
                onPress={() => setYearsClamped(years - CONSUME_YEARS_STEP)}
                disabled={years <= CONSUME_YEARS_MIN}
                hitSlop={8}
                accessibilityLabel="Verzehr-Dauer verringern"
                style={({ pressed }) => ({ width: 32, height: 32, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.chip, opacity: years <= CONSUME_YEARS_MIN ? 0.35 : pressed ? 0.6 : 1 })}
              >
                <Ionicons name="remove" size={18} color={theme.text} />
              </Pressable>
              <Pressable onPress={askYears} hitSlop={6} accessibilityLabel="Verzehr-Dauer genau eingeben">
                <Text style={[styles.text, styles.number, { fontWeight: '600', color: theme.accent }]}>{years} Jahre</Text>
              </Pressable>
              <Pressable
                onPress={() => setYearsClamped(years + CONSUME_YEARS_STEP)}
                disabled={years >= CONSUME_YEARS_MAX}
                hitSlop={8}
                accessibilityLabel="Verzehr-Dauer erhöhen"
                style={({ pressed }) => ({ width: 32, height: 32, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.chip, opacity: years >= CONSUME_YEARS_MAX ? 0.35 : pressed ? 0.6 : 1 })}
              >
                <Ionicons name="add" size={18} color={theme.text} />
              </Pressable>
            </View>
          </View>
        )}
      </View>
      {drawMonthly > 0 && (
        <DetailRows
          rows={[
            { label: 'Nötiges Depot bei Kapitalerhalt', hint: 'die Entnahme kommt allein aus der Rendite', value: preserve !== null ? eur(preserve) : '–', private: true },
            { label: `Bei Verzehr über ${years} Jahre`, hint: 'das Depot ist danach aufgebraucht', value: consume !== null ? eur(consume) : '–', private: true },
            { label: 'Dein Depot könnte heute auszahlen', hint: 'pro Monat aus der Rendite, ohne zu schrumpfen', value: eur(monthlyFromCapital(currentValue, annualReturn)), private: true },
          ]}
        />
      )}
      {drawMonthly > 0 && (preserve !== null || consume !== null) && (
        <View style={[styles.row, { gap: 10 }]}>
          {preserve !== null && adoptButton('Kapitalerhalt als Ziel', preserve, 'Kapitalerhalt-Depot als Wunschbetrag übernehmen')}
          {consume !== null && adoptButton('Verzehr als Ziel', consume, `Verzehr-Depot über ${years} Jahre als Wunschbetrag übernehmen`)}
        </View>
      )}

      <View style={[styles.row, { gap: 6, paddingHorizontal: 4, marginTop: 8 }]}>
        <Text style={[styles.label, { fontWeight: '600' }]}>Sparpläne</Text>
        <InfoDot
          title="Sparpläne"
          text={
            'Die App erkennt einen Sparplan selbst, sobald du ein Wertpapier in mindestens drei der letzten vier Monate für einen ähnlichen Betrag gekauft hast. Einen neuen Sparplan kannst du vorab in den Details der Position markieren.\n\nDie Hochrechnung ist eine grobe Schätzung – Kurse schwanken, und niemand kennt die künftige Rendite.'
          }
        />
      </View>
      {planRows.length + inactiveRows.length > 0 ? (
        <DetailRows rows={[...planRows, ...inactiveRows, { label: 'Zusammen', hint: 'pro Monat', value: eur(savings.monthlyRate), private: true }]} />
      ) : (
        <View style={styles.card}>
          <Text style={[styles.text, { color: theme.muted }]}>Keine regelmäßigen Käufe erkannt. Die Hochrechnung rechnet deshalb ohne Sparrate.</Text>
        </View>
      )}

      <DetailRows
        rows={[
          {
            label: 'Dieses Jahr eingezahlt',
            hint: 'alle Käufe zusammen, auch Einzelkäufe',
            value: eur(savings.investedThisYear),
            private: true,
            // Spielerei: Der Betrag läuft durch die Farben deiner Positionen
            valueColors: positions.map((_, i) => positionColor(theme, i)),
          },
        ]}
      />

    </Sheet>
  );
}
