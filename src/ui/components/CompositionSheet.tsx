import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import type { FundComposition } from '../../data/holdingsImport';
import { CompositionResult, displayName, Slice } from '../../finance/composition';
import { assignHoldings, describeFund, matchScore } from '../../finance/holdingsMatch';
import { industryBreakdown, industryInfo } from '../../finance/industries';
import type { IndustryCache } from '../../market/industries';
import type { OverlapResult } from '../../finance/overlap';
import type { PositionResult } from '../../finance/performance';
import { percent } from '../format';
import { Sheet } from '../Sheet';
import { useStyles } from '../styles';
import { DetailRows } from './DetailRows';
import { SecurityIds } from './SecurityIds';

export interface PickedHoldings {
  funds: FundComposition[];
  /** Namen der Dateien, die keine lesbare Bestandsliste waren */
  failed: string[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  positions: PositionResult[];
  result: CompositionResult;
  overlap: OverlapResult;
  compositions: Record<string, FundComposition>;
  /** Geschäftsbereiche der größten Firmen, soweit schon nachgeschlagen */
  industries: IndustryCache;
  /** Lässt eine oder mehrere Bestandslisten auswählen und liest sie ein. null = abgebrochen. */
  onPick: (many: boolean) => Promise<PickedHoldings | null>;
  /** Speichert Listen zu den angegebenen ISINs (ersetzt vorhandene) */
  onSave: (lists: Record<string, FundComposition>) => void;
  onRemove: (isin: string) => void;
}

/** So viele Länder werden einzeln gezeigt, der Rest als „Übrige Länder“. */
const MAX_COUNTRIES = 10;
/** Unter diesem Wert passt eine Liste erkennbar nicht zum Namen des ETF; ab GOOD passt sie gut. */
const POOR = 0.4;
const GOOD = 0.75;

function Bars({ slices, color }: { slices: Slice[]; color: string }) {
  const { theme, styles } = useStyles();
  const max = Math.max(...slices.map((s) => s.weight), 1e-9);
  return (
    <View style={[styles.card, { gap: 12 }]}>
      {slices.map((s) => (
        <View key={s.label} style={{ gap: 5 }}>
          <View style={[styles.row, { justifyContent: 'space-between', gap: 12 }]}>
            <Text style={[styles.text, { flex: 1 }]}>{s.label}</Text>
            <Text style={[styles.text, styles.number, { fontWeight: '600' }]}>{percent(s.weight)}</Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.chip, overflow: 'hidden' }}>
            <View style={{ width: `${(s.weight / max) * 100}%`, height: 6, borderRadius: 3, backgroundColor: color }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Eine ausgewählte Liste mit dem ETF, dem sie zugeordnet werden soll. */
interface Draft {
  fund: FundComposition;
  isin: string | null;
  confident: boolean;
}

/** Länder, Branchen und größte Firmen über das ganze Depot, dazu der Import der Bestandslisten je ETF. */
export function CompositionSheet({ visible, onClose, positions, result, overlap, compositions, industries, onPick, onSave, onRemove }: Props) {
  const { theme, styles } = useStyles();
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const heading = [styles.label, { fontWeight: '600' as const, paddingHorizontal: 4, marginTop: 8 }];
  const funds = positions.filter((p) => p.instrument.kind !== 'Aktie');
  const nameOf = (isin: string) => positions.find((p) => p.instrument.isin === isin)?.instrument.shortName ?? isin;
  const describe = (fund: FundComposition) => describeFund(fund, displayName);
  // Langer und kurzer Name zusammen: Banken kürzen mal den einen, mal den anderen ab
  const fullName = (p: PositionResult) => `${p.instrument.name} ${p.instrument.shortName}`;

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch (e) {
      Alert.alert('Import nicht möglich', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Einzelne Liste für einen bestimmten ETF: warnen, wenn sie erkennbar zu einem anderen gehört
  const importFor = (isin: string) =>
    run(async () => {
      const picked = await onPick(false);
      if (!picked) return;
      const fund = picked.funds[0];
      if (!fund) throw new Error('Die Datei ist keine lesbare Bestandsliste.');
      const target = funds.find((p) => p.instrument.isin === isin);
      const own = target ? matchScore(fullName(target), fund) : null;
      if (own === null || own >= POOR) return onSave({ [isin]: fund });
      const better = funds
        .filter((p) => p.instrument.isin !== isin)
        .map((p) => ({ p, score: matchScore(fullName(p), fund) ?? 0 }))
        .sort((a, b) => b.score - a.score)[0];
      const summary = `Inhalt der Liste: ${describe(fund)}.`;
      if (better && better.score >= GOOD) {
        Alert.alert('Andere Liste?', `Diese Liste passt nicht zu ${nameOf(isin)}, aber gut zu ${better.p.instrument.shortName}.\n\n${summary}`, [
          { text: 'Abbrechen', style: 'cancel' },
          { text: `Bei ${better.p.instrument.shortName} importieren`, onPress: () => onSave({ [better.p.instrument.isin]: fund }) },
          { text: 'Trotzdem hier importieren', style: 'destructive', onPress: () => onSave({ [isin]: fund }) },
        ]);
      } else {
        Alert.alert('Passt die Liste?', `Diese Liste passt nicht zu dem, was der Name ${nameOf(isin)} erwarten lässt.\n\n${summary}`, [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Trotzdem importieren', onPress: () => onSave({ [isin]: fund }) },
        ]);
      }
    });

  // Mehrere Listen auf einmal: die App schlägt die Zuordnung vor, du bestätigst sie
  const importMany = () =>
    run(async () => {
      const picked = await onPick(true);
      if (!picked) return;
      if (picked.failed.length) Alert.alert('Nicht alle Dateien lesbar', `Keine Bestandsliste: ${picked.failed.join(', ')}`);
      if (!picked.funds.length) return;
      const assigned = assignHoldings(picked.funds, funds.map((p) => ({ isin: p.instrument.isin, name: fullName(p) })));
      setDrafts(assigned.map((a) => ({ fund: picked.funds[a.file], isin: a.isin, confident: a.confident })));
    });

  /** Nächster ETF für diese Liste: der Reihe nach alle, die noch keine andere Liste aus der Auswahl haben, dann „keiner“. */
  const cycle = (index: number) =>
    setDrafts((prev) => {
      if (!prev) return prev;
      const taken = new Set(prev.filter((_, i) => i !== index).map((d) => d.isin));
      const options: (string | null)[] = [...funds.map((p) => p.instrument.isin).filter((isin) => !taken.has(isin)), null];
      const next = options[(options.indexOf(prev[index].isin) + 1) % options.length];
      return prev.map((d, i) => (i === index ? { ...d, isin: next, confident: true } : d));
    });

  const applyDrafts = () => {
    if (!drafts) return;
    onSave(Object.fromEntries(drafts.filter((d) => d.isin).map((d) => [d.isin!, d.fund])));
    setDrafts(null);
  };

  const industryOf = (key: string) => industries[key]?.industry;
  const areas = industryBreakdown(result.companies, industryOf);
  const pending = result.companies.filter((c) => !industries[c.key]).length;

  const countries = result.countries.slice(0, MAX_COUNTRIES);
  const restCountries = result.countries.slice(MAX_COUNTRIES).reduce((s, c) => s + c.weight, 0);
  if (restCountries > 0.0005) countries.push({ label: `Übrige Länder (${result.countries.length - MAX_COUNTRIES})`, weight: restCountries });
  const uncovered = 1 - result.covered;
  const withRest = (slices: Slice[]) => (uncovered > 0.0005 ? [...slices, { label: 'Nicht ausgewertet', weight: uncovered }] : slices);
  const chip = (pressed: boolean) => ({ backgroundColor: theme.chip, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, opacity: busy ? 0.4 : pressed ? 0.6 : 1 });

  return (
    <Sheet visible={visible} onClose={onClose} title="Was steckt drin">
      {result.covered > 0 ? (
        <>
          {uncovered > 0.0005 && (
            <Text style={[styles.small, { paddingHorizontal: 4 }]}>
              Ausgewertet sind {percent(result.covered)} deines Depots. Für den Rest fehlt eine Bestandsliste (siehe unten).
            </Text>
          )}
          <Text style={heading}>Länder</Text>
          <Bars slices={withRest(countries)} color={theme.accent} />
          <Text style={heading}>Branchen</Text>
          <Bars slices={withRest(result.sectors)} color={theme.benchmark} />
          <Text style={heading}>Größte Firmen in deinem Depot</Text>
          <DetailRows
            rows={result.companies.map((c, i) => ({
              label: `${i + 1}. ${c.label}`,
              hint: `${c.country} · ${industryOf(c.key) ? industryInfo(industryOf(c.key)!).label : c.sector}${c.sources > 1 ? ` · in ${c.sources} deiner Wertpapiere` : ''}`,
              value: percent(c.weight),
            }))}
          />

          <Text style={heading}>Womit die größten Firmen ihr Geld verdienen</Text>
          {areas.slices.length > 0 ? (
            <>
              <View style={[styles.card, { gap: 0, paddingVertical: 4 }]}>
                {areas.slices.map((a, i) => (
                  <View key={a.label} style={[{ paddingVertical: 12, gap: 3 }, i > 0 && styles.divider]}>
                    <View style={[styles.row, { justifyContent: 'space-between', gap: 12 }]}>
                      <Text style={[styles.text, { flex: 1, fontWeight: '600' }]}>{a.label}</Text>
                      <Text style={[styles.text, styles.number, { fontWeight: '600' }]}>{percent(a.weight)}</Text>
                    </View>
                    {a.explain ? <Text style={styles.small}>{a.explain}</Text> : null}
                    <Text style={[styles.small, { color: theme.text }]}>{a.companies.slice(0, 4).join(', ')}{a.companies.length > 4 ? ` und ${a.companies.length - 4} weitere` : ''}</Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.small, { paddingHorizontal: 4 }]}>
                Gerechnet aus {areas.known} der {result.companies.length} größten Firmen, die zusammen {percent(areas.covered)} deines Depots ausmachen. Die vielen kleineren
                Firmen sind hier nicht enthalten. Die Einordnung stammt von Yahoo.{pending > 0 ? ` ${pending} Firmen werden noch nachgeschlagen.` : ''}
              </Text>
            </>
          ) : (
            <Text style={[styles.small, { paddingHorizontal: 4 }]}>
              {pending > 0 ? 'Die Geschäftsbereiche werden gerade bei Yahoo nachgeschlagen. Das dauert einen Moment.' : 'Für diese Firmen hat Yahoo keinen Geschäftsbereich geliefert.'}
            </Text>
          )}

          {overlap.pairs.length > 0 && (
            <>
              <Text style={heading}>Überschneidungen zwischen deinen ETFs</Text>
              <View style={[styles.card, { gap: 0, paddingVertical: 4 }]}>
                {overlap.pairs.map((pair, i) => {
                  const color = pair.level === 'high' ? theme.warn : pair.level === 'medium' ? theme.text : theme.positive;
                  const partial = Math.min(pair.coverageA, pair.coverageB) < 0.9;
                  return (
                    <View key={`${pair.a.instrument.isin}-${pair.b.instrument.isin}`} style={[{ paddingVertical: 12, gap: 3 }, i > 0 && styles.divider]}>
                      <View style={[styles.row, { justifyContent: 'space-between', gap: 12 }]}>
                        <Text style={[styles.text, { flex: 1, fontWeight: '600' }]}>
                          {pair.a.instrument.shortName} und {pair.b.instrument.shortName}
                        </Text>
                        <Text style={[styles.text, styles.number, { fontWeight: '700', color }]}>{partial ? 'mind. ' : ''}{percent(pair.overlap)}</Text>
                      </View>
                      <Text style={[styles.small, pair.level === 'high' && { color: theme.warn }]}>
                        {pair.level === 'high'
                          ? 'Hoch: Beide stecken zum großen Teil in denselben Firmen. Der zweite ETF bringt wenig zusätzliche Streuung.'
                          : pair.level === 'medium'
                            ? 'Mittel: Ein Teil der Firmen ist in beiden enthalten, jeder ETF bringt aber auch Eigenes mit.'
                            : 'Gering: Die beiden ETFs ergänzen sich weitgehend.'}
                      </Text>
                      {pair.common > 0 && (
                        <Text style={[styles.small, { color: theme.text }]}>
                          {pair.common.toLocaleString('de-DE')} gemeinsame Firmen, z. B. {pair.examples.join(', ')}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
              <Text style={[styles.small, { paddingHorizontal: 4 }]}>
                Die Prozentzahl sagt, welcher Teil beider ETFs in denselben Firmen mit demselben Gewicht steckt. 100 % wären zwei gleiche ETFs, 0 % zwei völlig
                verschiedene.{overlap.duplicatedCount > 0 ? ` Insgesamt liegen ${percent(overlap.duplicated)} deines Depots in ${overlap.duplicatedCount.toLocaleString('de-DE')} Firmen, die du über mehrere ETFs hältst.` : ''}
              </Text>
              <View style={[styles.card, { gap: 8 }]}>
                <Text style={[styles.label, { fontWeight: '600' }]}>Zur Einordnung</Text>
                <Text style={styles.text}>• Eine Überschneidung ist kein Fehler. Sie zeigt nur, dass sich zwei ETFs ähnlich entwickeln und du in diesen Firmen stärker gewichtet bist, als es ein ETF allein wäre.</Text>
                <Text style={styles.text}>• Für eine breitere Streuung werden üblicherweise ETFs kombiniert, die sich ergänzen, etwa Industrieländer mit Schwellenländern, statt zwei ähnliche.</Text>
                <Text style={styles.text}>• Ein verbreiteter Weg ohne Verkauf: künftige Sparraten in den ETF lenken, der noch wenig vertreten ist. Ein Verkauf kann Steuern und Gebühren auslösen.</Text>
                <Text style={styles.small}>Das ist eine allgemeine Erklärung und keine Anlageberatung. Die App kennt deine Ziele und deine Steuersituation nicht.</Text>
              </View>
            </>
          )}
        </>
      ) : (
        <Text style={[styles.text, { color: theme.muted }]}>
          In welchen Ländern, Branchen und Firmen steckt dein Geld? Dafür braucht die App von jedem ETF die Bestandsliste des Anbieters.
        </Text>
      )}

      <Text style={heading}>Bestandslisten</Text>

      {drafts ? (
        // Kontrollansicht nach dem Sammel-Import: Vorschlag prüfen, bei Bedarf ändern, dann übernehmen
        <View style={[styles.card, { gap: 0, paddingVertical: 4, borderWidth: 1, borderColor: theme.accent }]}>
          <Text style={[styles.small, { paddingVertical: 10 }]}>
            Die App hat jede Liste dem ETF zugeordnet, zu dessen Namen ihr Inhalt am besten passt. Prüfe die Zuordnung, ändere sie bei Bedarf und tippe auf „Übernehmen“.
          </Text>
          {drafts.map((d, i) => (
            <View key={i} style={[styles.divider, { paddingVertical: 12, gap: 6 }]}>
              <Text style={styles.small}>Liste {i + 1}: {describe(d.fund)}</Text>
              <View style={[styles.row, { gap: 10 }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: d.isin ? theme.text : theme.muted }}>{d.isin ? `→ ${nameOf(d.isin)}` : '→ nicht zuordnen'}</Text>
                  {d.isin && !d.confident && <Text style={[styles.small, { color: theme.warn }]}>Nur ein Vorschlag: bitte prüfen</Text>}
                  {d.isin && compositions[d.isin] && <Text style={styles.small}>ersetzt die vorhandene Liste</Text>}
                </View>
                <Pressable onPress={() => cycle(i)} style={({ pressed }) => chip(pressed)}>
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>Ändern</Text>
                </Pressable>
              </View>
            </View>
          ))}
          <View style={[styles.row, styles.divider, { gap: 10, paddingVertical: 12 }]}>
            <Pressable
              onPress={applyDrafts}
              disabled={!drafts.some((d) => d.isin)}
              style={({ pressed }) => ({ flex: 1, backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center', opacity: !drafts.some((d) => d.isin) ? 0.4 : pressed ? 0.7 : 1 })}
            >
              <Text style={{ color: theme.onAccent, fontSize: 15, fontWeight: '600' }}>Übernehmen</Text>
            </Pressable>
            <Pressable onPress={() => setDrafts(null)} style={({ pressed }) => ({ flex: 1, backgroundColor: theme.chip, borderRadius: 12, paddingVertical: 12, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>Verwerfen</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        funds.length > 0 && (
          <Pressable onPress={importMany} disabled={busy} style={({ pressed }) => ({ backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: busy ? 0.4 : pressed ? 0.7 : 1 })}>
            <Text style={{ color: theme.onAccent, fontSize: 16, fontWeight: '600' }}>Alle Listen auf einmal importieren</Text>
          </Pressable>
        )
      )}

      <View style={[styles.card, { gap: 0, paddingVertical: 4 }]}>
        {positions.map((p, i) => {
          const fund = compositions[p.instrument.isin];
          const isStock = p.instrument.kind === 'Aktie';
          const inherited = isStock && !result.missing.includes(p);
          const score = fund ? matchScore(fullName(p), fund) : null;
          return (
            <View key={p.instrument.isin} style={[styles.row, { paddingVertical: 12, gap: 10 }, i > 0 && styles.divider]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text }}>{p.instrument.shortName}</Text>
                {/* Zum Suchen beim Anbieter: Antippen kopiert die jeweilige Nummer */}
                <View style={{ marginVertical: 2 }}>
                  <SecurityIds isin={p.instrument.isin} wkn={p.instrument.wkn} />
                </View>
                <Text style={styles.small}>
                  {fund
                    ? `${describe(fund)}${fund.asOf ? ` · Stand ${fund.asOf}` : ''}`
                    : isStock
                      ? inherited
                        ? 'Einzelaktie · Land und Branche aus einem deiner ETFs übernommen'
                        : 'Einzelaktie · zählt als eigene Firma, Land und Branche unbekannt'
                      : 'noch keine Bestandsliste'}
                </Text>
                {score !== null && score < POOR && <Text style={[styles.small, { color: theme.warn }]}>Der Inhalt passt nicht zum Namen. Vielleicht die Liste eines anderen ETF?</Text>}
                {fund && (
                  <Pressable onPress={() => onRemove(p.instrument.isin)} hitSlop={6}>
                    <Text style={[styles.small, { color: theme.negative }]}>Liste entfernen</Text>
                  </Pressable>
                )}
              </View>
              {!isStock && (
                <Pressable onPress={() => importFor(p.instrument.isin)} disabled={busy} style={({ pressed }) => chip(pressed)}>
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>{fund ? 'Aktualisieren' : 'Importieren'}</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      <Text style={[styles.small, { paddingHorizontal: 4 }]}>
        So bekommst du die Liste: Suche in Safari nach der ISIN oder WKN deines ETF (Antippen kopiert sie), öffne die Seite beim Anbieter (z. B. ishares.com), lade dort
        unter „Positionen“ bzw. „Bestände“ die vollständige Liste als CSV herunter. Mit „Alle Listen auf einmal importieren“ wählst du danach alle Dateien zusammen aus,
        die App ordnet sie den ETFs zu. Geprüft ist das Format von iShares. Listen anderer Anbieter funktionieren, wenn sie als CSV mit Name, Gewichtung und Land oder
        Branche vorliegen. Die Listen ändern sich langsam, ein Import alle paar Monate reicht.
      </Text>
      <Text style={[styles.small, { paddingHorizontal: 4 }]}>
        Die Dateien nennen ihren ETF nicht. Die App erkennt die Zuordnung daran, ob Länder, Branchen und Anzahl der Firmen zum Namen des ETF passen. Bei zwei sehr
        ähnlichen ETFs kann sie sich irren, deshalb zeigt sie dir die Zuordnung vor dem Übernehmen.
      </Text>
      <Text style={[styles.small, { paddingHorizontal: 4 }]}>
        Die Branchen stammen vom Anbieter und sind grob (z. B. „IT“ oder „Industrie“). Genauer wird es im Abschnitt „Womit die größten Firmen ihr Geld verdienen“:
        Dort steht für die größten Firmen der Geschäftsbereich, etwa „Halbleiter“ oder „Maschinenbau“. Ein eigenes Etikett „KI“ gibt es in den Daten nicht.
      </Text>
    </Sheet>
  );
}
