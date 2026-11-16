import { ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadSetup, Setup } from '../comdirect/credentials';
import { mapPortfolio } from '../comdirect/portfolio';
import { localDate } from '../comdirect/sync';
import { backupDue, exportBackup, pickHoldings } from '../data/backup';
import type { FundComposition } from '../data/holdingsImport';
import { chartModePreference, compositionStore, industryStore, assumedReturnPreference, goalPreference, loadSettings, monthReviewDismissed, monthReviewPreference, savingsMarks, targetSharesPreference, lastBackup, loadStored, marketCache, StoredPortfolio, welcomeSeen } from '../data/store';
import { IndustryCache, loadIndustries } from '../market/industries';
import { refreshMarket } from '../market/refresh';
import type { MarketData } from '../market/yahoo';
import { createDemoData } from '../demo/demoData';
import { buildInsights } from '../finance/insights';
import { reviewToShow } from '../finance/monthReview';
import { analyzePeriod, analyzePositions, buildSeries, PositionResult } from '../finance/performance';
import { analyzeAllocation, TargetShares } from '../finance/allocation';
import { analyzeComposition } from '../finance/composition';
import { analyzeOverlap } from '../finance/overlap';
import { DEFAULT_RETURN, detectSavings, planStatus, projectGoal } from '../finance/savings';
import { estimateVorabpauschale, pauschaleYear } from '../finance/vorabpauschale';
import { analyzeYears } from '../finance/years';
import { BenchmarkSheet } from '../ui/components/BenchmarkSheet';
import { ChartCard } from '../ui/components/ChartCard';
import { AllocationSheet } from '../ui/components/AllocationSheet';
import { CompositionCard } from '../ui/components/CompositionCard';
import { CompositionSheet } from '../ui/components/CompositionSheet';
import { ConnectSheet } from '../ui/components/ConnectSheet';
import { GoalSheet } from '../ui/components/GoalSheet';
import { SavingsCard } from '../ui/components/SavingsCard';
import { HelpSheet } from '../ui/components/HelpSheet';
import { VisitBanner } from '../ui/components/VisitBanner';
import { YearList } from '../ui/components/YearList';
import { YearSheet } from '../ui/components/YearSheet';
import { useVisit } from './useVisit';
import { Hero } from '../ui/components/Hero';
import { InsightList } from '../ui/components/InsightList';
import { MonthReviewCard } from '../ui/components/MonthReviewCard';
import { LoginSheet } from '../ui/components/LoginSheet';
import { PositionList, positionColor } from '../ui/components/PositionList';
import { PositionSheet } from '../ui/components/PositionSheet';
import { SuccessToast } from '../ui/components/SuccessToast';
import { TourOverlay, TourRect } from '../ui/components/TourOverlay';
import { WelcomeSheet } from '../ui/components/WelcomeSheet';
import { useShield } from '../ui/AppLock';
import { dateTime, monthYear } from '../ui/format';
import { usePrivacy } from '../ui/privacy';
import { successFeedback } from '../ui/haptics';
import { useStyles } from '../ui/styles';

/** Zeiträume für Chart und Kopf; das laufende Jahr trägt die Jahreszahl als Beschriftung. */
const periodsFor = (asOf: string) => {
  const year = Number(asOf.slice(0, 4));
  const shift = (n: number) => `${year - n}${asOf.slice(4)}`;
  return [
    { label: String(year), long: 'seit Jahresbeginn', start: `${year - 1}-12-31` },
    { label: '1 J', long: 'im letzten Jahr', start: shift(1) },
    { label: '3 J', long: 'in 3 Jahren', start: shift(3) },
    { label: 'Max', long: 'seit Beginn', start: null },
  ];
};

type OpenSheet = 'welcome' | 'benchmark' | 'connect' | 'login' | 'help' | 'years' | 'goal' | 'allocation' | 'composition' | null;

/** Stationen der Spotlight-Tour über dem Demo-Depot. */
const TOUR_STEPS = [
  {
    key: 'hero',
    title: 'Dein Depotwert',
    text: 'Die große Zahl ist der aktuelle Wert deines Depots. Ein „≈“ davor heißt: mit aktuellen Kursen geschätzt. Das Auge verbirgt alle Beträge, der Pfeil daneben aktualisiert über comdirect.',
  },
  {
    key: 'chart',
    title: 'Verlauf & Vergleich',
    text: 'Der Chart zeigt die Entwicklung im gewählten Zeitraum – oben wechselst du ihn. Die blaue Linie vergleicht dein Depot mit dem MSCI World.',
  },
  {
    key: 'saving',
    title: 'Sparen, Ziel & Jahre',
    text: 'Links deine monatliche Sparrate und der Fortschritt zu deinem Wunschbetrag, samt Entnahme-Rechner. Rechts die Rendite der einzelnen Jahre. Antippen öffnet die Details.',
  },
  {
    key: 'positions',
    title: 'Deine Positionen',
    text: 'Jede Position hat ihre eigene Farbe, der Balken zeigt die Gewichtung. Über „Zielaufteilung“ legst du Wunschanteile fest, und die App weist auf Abweichungen hin.',
  },
  {
    key: 'footer',
    title: 'Verbinden & Hilfe',
    text: 'Hier verbindest du dein echtes comdirect-Depot, und unter „Anleitung & FAQ“ ist jede Funktion ausführlich erklärt. „Fertig“ öffnet einmal „Zugang verwalten“ – dort wartet noch ein Sicherheits-Tipp.',
  },
];

export function DashboardScreen() {
  const { theme, styles } = useStyles();
  const insets = useSafeAreaInsets();
  // Für die Tour-Vorführung des Auge-Modus
  const { toggle: togglePrivacy } = usePrivacy();
  const demo = useMemo(() => createDemoData(), []);
  const [stored, setStored] = useState<StoredPortfolio | null>(null);
  const [market, setMarket] = useState<MarketData | null>(null);
  const [marketLoaded, setMarketLoaded] = useState(false);
  // Zählt hoch, sobald ein Abruf aktueller Kurse abgeschlossen ist (für das Besuchs-Banner)
  const [marketSettled, setMarketSettled] = useState(0);
  const marketRef = useRef<MarketData | null>(null);
  marketRef.current = market;
  // Zählt hoch, wenn die App wieder in den Vordergrund kommt oder 15 Minuten vergangen sind
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    let delayed: ReturnType<typeof setTimeout> | null = null;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      // Erst Vorhang und Tipp-Animation den Vortritt lassen, dann die Kurse nachladen
      if (delayed) clearTimeout(delayed);
      delayed = setTimeout(bump, 1000);
    });
    const timer = setInterval(bump, 15 * 60 * 1000);
    return () => {
      sub.remove();
      clearInterval(timer);
      if (delayed) clearTimeout(delayed);
    };
  }, []);
  const data = useMemo(
    () => (stored ? mapPortfolio(stored.raw, stored.snapshots, localDate(new Date(stored.fetchedAt)), stored.fetchedAt, market) : demo),
    [stored, market, demo],
  );
  const visit = useVisit(data, marketSettled);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [periodIndex, setPeriodIndex] = useState(1);
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [selected, setSelected] = useState<PositionResult | null>(null);
  const [goal, setGoal] = useState<number | null>(null);
  // Kurze Erfolgs-Einblendung nach einer abgeschlossenen Aktualisierung
  const [toast, setToast] = useState<string | null>(null);
  // Chart-Ansicht: Wert in Euro oder Rendite in Prozent; letzte Wahl bleibt gespeichert
  const [chartMode, setChartMode] = useState<'value' | 'return'>('value');
  const changeChartMode = (next: 'value' | 'return') => {
    setChartMode(next);
    chartModePreference.set(next).catch(() => {});
  };
  const [annualReturn, setAnnualReturn] = useState(DEFAULT_RETURN);
  const [marks, setMarks] = useState<string[]>([]);
  const [targets, setTargets] = useState<TargetShares>({});
  const [compositions, setCompositions] = useState<Record<string, FundComposition>>({});
  const [industries, setIndustries] = useState<IndustryCache>({});
  const [industriesLoaded, setIndustriesLoaded] = useState(false);
  const industriesRef = useRef<IndustryCache>({});
  industriesRef.current = industries;

  // Ziel, Rendite und Sparplan-Markierungen; auch nach dem Wiederherstellen einer Sicherung neu lesen
  const loadPreferences = () =>
    loadSettings()
      .then((s) => {
        setGoal(s.goal);
        if (s.assumedReturn !== null) setAnnualReturn(s.assumedReturn);
        setMarks(s.savingsMarks);
        setTargets(s.targetShares);
      })
      .catch(() => {});

  // Beim Start: Zugang und letzten comdirect-Abruf laden, sonst Demo-Daten zeigen
  useEffect(() => {
    loadSetup()
      .then((s) => {
        setSetup(s);
        // Erster Start ohne Zugang: einmalige Willkommens-Tour zeigen
        if (!s) {
          welcomeSeen
            .get()
            .then((seen) => !seen && setSheet('welcome'))
            .catch(() => {});
        }
      })
      .catch(() => {});
    loadPreferences();
    chartModePreference.get().then(setChartMode).catch(() => {});
    monthReviewPreference.get().then(setReviewEnabled).catch(() => {});
    monthReviewDismissed.get().then(setDismissedReview).catch(() => {});
    compositionStore.get().then(setCompositions).catch(() => {});
    industryStore
      .get()
      .then(setIndustries)
      .catch(() => {})
      .finally(() => setIndustriesLoaded(true));
    loadStored()
      .then((s) => s && setStored(s))
      .catch(() => {});
    marketCache
      .get()
      .then(setMarket)
      .catch(() => {})
      .finally(() => setMarketLoaded(true));
  }, []);

  // Yahoo nachladen: Kurshistorie höchstens alle 12 Stunden, aktuelle Kurse höchstens alle 15 Minuten
  const refreshing = useRef(false);
  useEffect(() => {
    if (!stored || !marketLoaded || refreshing.current) return;
    let cancelled = false;
    refreshing.current = true;
    refreshMarket(stored, marketRef.current)
      .then((next) => {
        if (next && !cancelled) setMarket(next);
      })
      .catch(() => {})
      .finally(() => {
        refreshing.current = false;
        setMarketSettled((n) => n + 1);
      });
    return () => {
      cancelled = true;
    };
  }, [stored, marketLoaded, tick]);

  // Zeiträume, die vor den ersten Umsatz reichen, zeigen dasselbe wie „Max“ und werden ausgegraut
  const first = useMemo(() => data.transactions.reduce((d, t) => (t.date < d ? t.date : d), data.asOf), [data]);
  const periods = useMemo(() => periodsFor(data.asOf), [data.asOf]);
  const starts = periods.map((p) => p.start);
  const available = starts.map((s) => s === null || s > first);
  const activeIndex = available[periodIndex] ? periodIndex : periods.length - 1;
  const from = starts[activeIndex];

  const result = useMemo(() => analyzePeriod(data, from), [data, from]);
  const series = useMemo(() => buildSeries(data, from), [data, from]);
  const positions = useMemo(() => analyzePositions(data), [data]);
  const composition = useMemo(() => analyzeComposition(positions, compositions), [positions, compositions]);
  const overlap = useMemo(() => analyzeOverlap(positions, compositions), [positions, compositions]);
  // Geschäftsbereiche der größten Firmen bei Yahoo nachschlagen; bekannte bleiben gespeichert
  const lookingUp = useRef(false);
  useEffect(() => {
    if (!industriesLoaded || lookingUp.current || !composition.companies.length) return;
    let cancelled = false;
    lookingUp.current = true;
    loadIndustries(fetch, composition.companies.map((c) => ({ key: c.key, label: c.label })), industriesRef.current)
      .then((next) => {
        if (!next) return;
        industryStore.set(next).catch(() => {});
        if (!cancelled) setIndustries(next);
      })
      .catch(() => {})
      .finally(() => {
        lookingUp.current = false;
      });
    return () => {
      cancelled = true;
    };
  }, [composition, industriesLoaded]);
  const saveCompositions = (next: Record<string, FundComposition>) => {
    setCompositions(next);
    compositionStore.set(next).catch(() => {});
  };
  const allocation = useMemo(() => analyzeAllocation(positions, targets), [positions, targets]);
  const insights = useMemo(() => buildInsights(data, positions, goal !== null, allocation), [data, positions, goal, allocation]);
  const review = useMemo(() => reviewToShow(data), [data]);
  // Monats-Rückblick: generell abschaltbar, einzelne Monate per Kreuz ausblendbar
  const [reviewEnabled, setReviewEnabled] = useState(true);
  const [dismissedReview, setDismissedReview] = useState<string | null>(null);
  const changeReviewEnabled = (on: boolean) => {
    setReviewEnabled(on);
    monthReviewPreference.set(on).catch(() => {});
    if (on) {
      // Einschalten holt einen gerade ausgeblendeten Rückblick zurück
      setDismissedReview(null);
      monthReviewDismissed.set(null).catch(() => {});
    }
  };
  const dismissReview = (month: string) => {
    setDismissedReview(month);
    monthReviewDismissed.set(month).catch(() => {});
  };
  const savings = useMemo(() => detectSavings(data, marks), [data, marks]);
  const projection = useMemo(
    () => (goal ? projectGoal(result.endValue, goal, savings.monthlyRate, data.asOf, annualReturn) : null),
    [goal, result, savings, data, annualReturn],
  );
  const historicReturn = useMemo(() => analyzePeriod(data, null).irr, [data]);
  const years = useMemo(() => analyzeYears(data), [data]);
  const vorab = useMemo(() => estimateVorabpauschale(data, pauschaleYear(data.asOf)), [data]);
  const period = periods[activeIndex];
  const selectedIndex = selected ? positions.findIndex((p) => p.instrument.isin === selected.instrument.isin) : 0;
  const updatedAt = useMemo(
    () => (data.source.kind === 'comdirect' ? new Date(data.source.pricedAt ?? data.source.fetchedAt) : new Date()),
    [data],
  );
  const holdingsFrom = data.source.kind === 'comdirect' && data.source.pricedAt ? new Date(data.source.fetchedAt) : null;
  // Gewinn seit Kauf wie bei comdirect: heutiger Wert minus Einstandswert der heutigen Positionen
  const sinceBuy = useMemo(() => {
    const cost = data.costBasis;
    if (!cost) return null;
    const withCost = positions.filter((p) => cost[p.instrument.isin] > 0);
    const invested = withCost.reduce((s, p) => s + cost[p.instrument.isin], 0);
    if (invested <= 0) return null;
    const gain = withCost.reduce((s, p) => s + p.value, 0) - invested;
    return { gain, rel: gain / invested };
  }, [data, positions]);

  // Nach einem comdirect-Abruf an die Sicherung erinnern, wenn die letzte älter als vier Wochen ist.
  // Der Hinweis wartet, bis Vorhang und Sperre weg sind und der Erfolgs-Toast durch ist.
  const { locked: shieldLocked, covered: shieldCovered } = useShield();
  const [backupReminder, setBackupReminder] = useState<string | null>(null);
  const remindBackup = () => {
    lastBackup
      .get()
      .then((last) => {
        if (!backupDue(last)) return;
        setBackupReminder(
          last
            ? 'Deine letzte Sicherung ist über vier Wochen alt. Mit einer Sicherung in iCloud Drive bleiben die gesammelten Umsätze erhalten.'
            : 'Du hast deine Daten noch nicht gesichert. Mit einer Sicherung in iCloud Drive bleiben die gesammelten Umsätze erhalten.',
        );
      })
      .catch(() => {});
  };
  // --- Spotlight-Tour: scrollt zur Station, misst sie und stanzt sie aus dem Dunkel aus ---
  const { height: windowHeight } = useWindowDimensions();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollYRef = useRef(0);
  const tourTargets = useRef<Record<string, ComponentRef<typeof View> | null>>({});
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [tourRect, setTourRect] = useState<TourRect | null>(null);
  // Tour-Finale: „Zugang verwalten“ öffnet sich mit hervorgehobenem Schutz-Bereich
  const [connectHighlight, setConnectHighlight] = useState(false);
  const endTour = () => {
    setTourStep(null);
    setTourRect(null);
  };
  const nextTourStep = () => {
    if (tourStep !== null && tourStep + 1 < TOUR_STEPS.length) {
      setTourStep(tourStep + 1);
      return;
    }
    endTour();
    setConnectHighlight(true);
    setSheet('connect');
  };
  useEffect(() => {
    if (tourStep === null) return;
    const target = tourTargets.current[TOUR_STEPS[tourStep].key];
    if (!target) {
      // Station fehlt (sollte im Demo-Depot nicht vorkommen): einfach weiter
      nextTourStep();
      return;
    }
    let cancelled = false;
    const apply = (x: number, y: number, w: number, h: number) => {
      if (!cancelled) setTourRect({ x, y, width: w, height: h });
    };
    const id = setTimeout(() => {
      target.measureInWindow((x, y, w, h) => {
        if (cancelled) return;
        // Station so scrollen, dass sie samt Textblase sichtbar ist
        const desiredTop = insets.top + 56;
        const maxBottom = windowHeight - 230;
        let delta = 0;
        if (y < desiredTop) delta = y - desiredTop;
        else if (y + h > maxBottom) delta = Math.min(y - desiredTop, y + h - maxBottom);
        if (Math.abs(delta) > 4) {
          scrollRef.current?.scrollTo({ y: Math.max(0, scrollYRef.current + delta), animated: true });
          setTimeout(() => !cancelled && target.measureInWindow(apply), 420);
        } else {
          apply(x, y, w, h);
        }
      });
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourStep]);

  // Kleine Vorführungen während der Tour: Die erklärte Funktion läuft einmal selbst ab
  // und wird danach (oder beim Weiterspringen) wieder zurückgestellt.
  useEffect(() => {
    if (tourStep === null || tourRect === null) return;
    const key = TOUR_STEPS[tourStep].key;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let undo: (() => void) | null = null;
    if (key === 'hero') {
      // Erst lesen lassen, dann führt das Auge sich selbst vor
      timers.push(
        setTimeout(() => {
          togglePrivacy();
          undo = togglePrivacy;
        }, 2000),
      );
      timers.push(
        setTimeout(() => {
          togglePrivacy();
          undo = null;
        }, 3600),
      );
    } else if (key === 'chart') {
      // Einmal von links nach rechts durch alle verfügbaren Zeiträume, zurück,
      // dann der Euro/Prozent-Umschalter einmal hin und wieder her
      const previousPeriod = activeIndex;
      const previousMode = chartMode;
      const restore = () => {
        setPeriodIndex(previousPeriod);
        changeChartMode(previousMode);
      };
      let at = 2000;
      periods.forEach((_, i) => {
        if (!available[i] || i === previousPeriod) return;
        timers.push(
          setTimeout(() => {
            setPeriodIndex(i);
            undo = restore;
          }, at),
        );
        at += 1500;
      });
      timers.push(
        setTimeout(() => {
          setPeriodIndex(previousPeriod);
          undo = restore;
        }, at + 200),
      );
      timers.push(
        setTimeout(() => {
          changeChartMode(previousMode === 'value' ? 'return' : 'value');
          undo = restore;
        }, at + 1500),
      );
      timers.push(
        setTimeout(() => {
          changeChartMode(previousMode);
          undo = null;
        }, at + 3200),
      );
    }
    return () => {
      timers.forEach(clearTimeout);
      undo?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourStep, tourRect === null]);

  useEffect(() => {
    if (!backupReminder || shieldLocked || shieldCovered) return;
    const id = setTimeout(() => {
      setBackupReminder(null);
      Alert.alert('Daten sichern?', backupReminder, [
        { text: 'Später', style: 'cancel' },
        { text: 'Jetzt sichern', onPress: () => exportBackup().catch((e) => Alert.alert('Sichern fehlgeschlagen', e instanceof Error ? e.message : String(e))) },
      ]);
    }, 2800);
    return () => clearTimeout(id);
  }, [backupReminder, shieldLocked, shieldCovered]);

  return (
    <>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32, gap: 12 }}
        onScroll={(e) => {
          scrollYRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={32}
        scrollEnabled={tourStep === null}
      >
        <View ref={(r) => void (tourTargets.current.hero = r)} collapsable={false}>
          <Hero
            demo={data.source.kind !== 'comdirect'}
            value={result.endValue}
            gain={result.gain}
            irr={result.irr}
            periodLabel={period.long}
            updatedAt={updatedAt}
            holdingsFrom={holdingsFrom}
            sinceBuy={sinceBuy}
            onPreviewVisit={() => visit.show(result.endValue)}
            onRefresh={() => setSheet(setup ? 'login' : 'connect')}
          />
        </View>
        <View ref={(r) => void (tourTargets.current.chart = r)} collapsable={false}>
          <ChartCard series={series} benchmarkName={data.benchmark?.name ?? null}
            benchmark={result.benchmark && data.benchmark ? { irr: result.irr, benchmarkIrr: result.benchmark.irr, name: data.benchmark.name, onPress: () => setSheet('benchmark') } : null}
            periods={periods}
            periodIndex={activeIndex}
            available={available}
            historyHint={available.every(Boolean) ? null : `Umsätze von comdirect reichen bis ${monthYear(first)} zurück`}
            mode={chartMode}
            onModeChange={changeChartMode}
            onPeriodChange={setPeriodIndex}
          />
        </View>
        {review && reviewEnabled && review.month !== dismissedReview && <MonthReviewCard review={review} onDismiss={() => dismissReview(review.month)} />}
        <InsightList insights={insights} />
        <View ref={(r) => void (tourTargets.current.saving = r)} collapsable={false} style={{ flexDirection: 'row', gap: 12 }}>
          <SavingsCard savings={savings} goal={goal} projection={projection} onOpen={() => setSheet('goal')} />
          <YearList years={years.years} onOpen={() => setSheet('years')} />
        </View>
        <View ref={(r) => void (tourTargets.current.positions = r)} collapsable={false}>
          <PositionList positions={positions} onSelect={setSelected} allocation={allocation} onEditTargets={() => setSheet('allocation')} />
        </View>
        {data.source.kind === 'comdirect' && <CompositionCard result={composition} overlap={overlap} positions={positions} onOpen={() => setSheet('composition')} />}
        <View ref={(r) => void (tourTargets.current.footer = r)} collapsable={false}>
          {/* Fußzeile: stille Quellenangabe, darunter die beiden Links in einer Zeile */}
          <Text style={[styles.small, { textAlign: 'center', marginTop: 4 }]}>
            {data.source.kind === 'comdirect'
              ? holdingsFrom
                ? `Bestand: comdirect, ${dateTime(holdingsFrom)} · Kurse: Stand ${dateTime(updatedAt)}`
                : `comdirect · Stand ${dateTime(updatedAt)}`
              : 'Demo-Daten'}
          </Text>
          <View style={{ flexDirection: 'row', alignSelf: 'center', alignItems: 'center' }}>
            <Pressable onPress={() => setSheet('connect')} accessibilityRole="button" hitSlop={6} style={({ pressed }) => ({ paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
              <Text style={[styles.small, { color: theme.accent }]}>{setup ? 'Zugang verwalten' : 'comdirect verbinden'}</Text>
            </Pressable>
            <Text style={styles.small}>{'  ·  '}</Text>
            <Pressable onPress={() => setSheet('help')} accessibilityRole="button" hitSlop={6} style={({ pressed }) => ({ paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
              <Text style={[styles.small, { color: theme.accent }]}>Anleitung & FAQ</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {result.benchmark && data.benchmark && (
        <BenchmarkSheet
          visible={sheet === 'benchmark'}
          onClose={() => setSheet(null)}
          result={result}
          benchmark={result.benchmark}
          name={data.benchmark.name}
          periodLabel={`Zeitraum: ${period.long}`}
        />
      )}
      {visit.banner && (
        <VisitBanner
          key={visit.banner.id}
          content={visit.banner}
          onDone={visit.dismissBanner}
        />
      )}
      {toast && <SuccessToast message={toast} topInset={insets.top} onDone={() => setToast(null)} />}
      {tourStep !== null && (
        <TourOverlay
          rect={tourRect}
          title={TOUR_STEPS[tourStep].title}
          text={TOUR_STEPS[tourStep].text}
          step={tourStep}
          total={TOUR_STEPS.length}
          onNext={nextTourStep}
          onSkip={endTour}
        />
      )}
      <WelcomeSheet
        visible={sheet === 'welcome'}
        onDone={() => {
          welcomeSeen.set(true).catch(() => {});
          setSheet(null);
        }}
        onTour={() => {
          welcomeSeen.set(true).catch(() => {});
          setSheet(null);
          // Kurz warten, bis das Blatt zugezogen ist, dann die Tour starten
          setTimeout(() => setTourStep(0), 550);
        }}
        onHelp={() => {
          welcomeSeen.set(true).catch(() => {});
          setSheet('help');
        }}
      />
      <HelpSheet visible={sheet === 'help'} onClose={() => setSheet(null)} onReplayWelcome={() => setSheet('welcome')} />
      <CompositionSheet
        visible={sheet === 'composition'}
        onClose={() => setSheet(null)}
        positions={positions}
        result={composition}
        overlap={overlap}
        compositions={compositions}
        industries={industries}
        onPick={pickHoldings}
        onSave={(lists) => saveCompositions({ ...compositions, ...lists })}
        onRemove={(isin) => saveCompositions(Object.fromEntries(Object.entries(compositions).filter(([key]) => key !== isin)))}
      />
      <AllocationSheet
        visible={sheet === 'allocation'}
        onClose={() => setSheet(null)}
        positions={positions}
        targets={targets}
        allocation={allocation}
        monthlyRate={savings.monthlyRate}
        onChange={(next) => {
          setTargets(next);
          targetSharesPreference.set(next).catch(() => {});
        }}
      />
      <GoalSheet
        visible={sheet === 'goal'}
        onClose={() => setSheet(null)}
        savings={savings}
        instruments={data.instruments}
        goal={goal}
        projection={projection}
        annualReturn={annualReturn}
        historicReturn={historicReturn}
        currentValue={result.endValue}
        positions={positions}
        onChangeReturn={(rate) => {
          setAnnualReturn(rate);
          assumedReturnPreference.set(rate).catch(() => {});
        }}
        onChangeGoal={(next) => {
          setGoal(next);
          goalPreference.set(next).catch(() => {});
        }}
      />
      <YearSheet visible={sheet === 'years'} onClose={() => setSheet(null)} overview={years} benchmarkName={data.benchmark?.name ?? null} vorab={vorab} />
      <ConnectSheet
        visible={sheet === 'connect'}
        setup={setup}
        reviewEnabled={reviewEnabled}
        onReviewEnabledChange={changeReviewEnabled}
        highlightSchutz={connectHighlight}
        onSchutzHighlightDone={() => setConnectHighlight(false)}
        onClose={() => {
          setConnectHighlight(false);
          setSheet(null);
        }}
        onSaved={(next) => {
          setSetup(next);
          setSheet('login');
        }}
        onRestored={(next) => {
          setStored(next);
          loadPreferences();
          // Eine Sicherung kann auch ETF-Listen und Branchen mitbringen
          compositionStore.get().then(setCompositions).catch(() => {});
          industryStore.get().then(setIndustries).catch(() => {});
        }}
        onDisconnected={() => {
          setSetup(null);
          setStored(null);
          setMarket(null);
          setCompositions({});
          setIndustries({});
          setSheet(null);
        }}
      />
      {setup && (
        <LoginSheet
          visible={sheet === 'login'}
          setup={setup}
          onClose={() => setSheet(null)}
          onSynced={(next) => {
            setStored(next);
            setSheet(null);
            successFeedback();
            setToast(`Aktualisiert · ${dateTime(new Date())}`);
            remindBackup();
          }}
        />
      )}
      <PositionSheet
        position={selected}
        color={positionColor(theme, selectedIndex)}
        bankCost={selected && data.costBasis ? data.costBasis[selected.instrument.isin] ?? null : null}
        prepaidTax={selected && data.prepaidTax ? data.prepaidTax[selected.instrument.isin] ?? null : null}
        plan={selected ? planStatus(savings, selected.instrument.isin) : { kind: 'none' }}
        onMarkPlan={(marked) => {
          if (!selected) return;
          const isin = selected.instrument.isin;
          const next = marked ? [...marks.filter((m) => m !== isin), isin] : marks.filter((m) => m !== isin);
          setMarks(next);
          savingsMarks.set(next).catch(() => {});
        }}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
