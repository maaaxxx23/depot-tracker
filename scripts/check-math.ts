// Plausibilitätsprüfung der Renditeberechnung: npx tsx scripts/check-math.ts
import { createDemoData } from '../src/demo/demoData';
import { analyzePeriod, analyzePositions, buildSeries, priceAt, toDate } from '../src/finance/performance';
import { xirr } from '../src/finance/xirr';
import { analyzeYears, realizedSales, yearContributions } from '../src/finance/years';
import { estimateVorabpauschale, pauschaleYear } from '../src/finance/vorabpauschale';
import { analyzeAllocation, catchUpAmount, currentAsTargets, splitPurchase } from '../src/finance/allocation';
import { REVIEW_DAYS, reviewLastMonth, reviewToShow } from '../src/finance/monthReview';
import { averageAnnualReturn, corridorMonths, detectSavings, monthsToGoal, projectGoal, projectSeries } from '../src/finance/savings';
import { computeMovers } from '../src/finance/movers';
import { capitalToConsume, capitalToPreserve, monthlyFromCapital, roundCapital } from '../src/finance/withdrawal';
import { buildInsights, concentration, drawdownOfCurrentHoldings, nextMilestone, savingsStreak } from '../src/finance/insights';
import { PortfolioData, Transaction } from '../src/types';

let failed = 0;
function check(name: string, actual: number | null, expected: number, tolerance = 1e-6) {
  const ok = actual !== null && Math.abs(actual - expected) <= tolerance;
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${actual} (erwartet ${expected})`);
}

// 1000 € rein, nach 366 Tagen 1100 € raus
check('XIRR Einmalanlage', xirr([{ date: toDate('2020-01-01'), amount: -1000 }, { date: toDate('2021-01-01'), amount: 1100 }]), Math.pow(1.1, 365 / 366) - 1);

// Zwei Einzahlungen, Lösung per Barwert-Gleichung gegenprüfen
const flows = [
  { date: toDate('2021-01-01'), amount: -1000 },
  { date: toDate('2021-07-01'), amount: -500 },
  { date: toDate('2022-01-01'), amount: 1700 },
];
const r = xirr(flows)!;
const npv = flows.reduce((s, f) => s + f.amount / Math.pow(1 + r, (f.date.getTime() - flows[0].date.getTime()) / 86_400_000 / 365), 0);
check('XIRR Barwert = 0', npv, 0, 1e-4);

// Depot nur aus dem Benchmark-ETF: Schattendepot muss identisch sein
const demo = createDemoData('2026-11-04');
const onlyWorld = { ...demo, transactions: demo.transactions.filter((t) => t.isin === demo.benchmark!.isin) };
for (const from of [null, '2025-11-04', '2023-11-04']) {
  const res = analyzePeriod(onlyWorld, from);
  // Kleine Abweichungen durch auf Cent gerundete Kurswerte in den Demo-Daten
  check(`Nur Benchmark (${from ?? 'Max'}) Endwert`, res.benchmark!.endValue, res.endValue, 0.1);
  check(`Nur Benchmark (${from ?? 'Max'}) IRR`, res.benchmark!.irr, res.irr!, 1e-5);
}

// Zeitgewichtete Rendite: kauft das Depot nur den Index (ohne Gebühren, zum Tageskurs), ist sie gleich der Indexrendite
{
  const isin = demo.benchmark!.isin;
  const pure = {
    ...demo,
    transactions: demo.transactions
      .filter((t) => t.isin === isin && t.type !== 'dividend')
      .map((t) => ({ ...t, fees: 0, amount: t.quantity * priceAt(demo.prices, isin, t.date) })),
  };
  for (const from of [null, '2023-11-04']) {
    const series = buildSeries(pure, from);
    const worst = Math.max(...series.map((p) => Math.abs(p.twr - p.benchmarkReturn!)));
    check(`TWR = Indexrendite (${from ?? 'Max'})`, worst, 0, 1e-9);
    check(`TWR startet bei 0 (${from ?? 'Max'})`, series[0].twr, 0, 1e-12);
  }
  // Konstante Kurse: Käufe und Verkäufe ändern die Rendite nicht
  const flatPrices = { [isin]: [{ date: '2020-01-01', price: 100 }] };
  const flatData = {
    ...pure,
    prices: { ...pure.prices, ...flatPrices },
    transactions: [
      { date: '2024-01-02', isin, type: 'buy' as const, quantity: 10, amount: 1000, fees: 0 },
      { date: '2024-06-03', isin, type: 'buy' as const, quantity: 50, amount: 5000, fees: 0 },
      { date: '2025-02-03', isin, type: 'sell' as const, quantity: 40, amount: 4000, fees: 0 },
    ],
  };
  check('TWR bei konstanten Kursen trotz Käufen/Verkäufen', Math.max(...buildSeries(flatData, null).map((p) => Math.abs(p.twr))), 0, 1e-12);
}

// Demo-Depot ausgeben
for (const from of [null, '2023-11-04', '2025-11-04']) {
  const res = analyzePeriod(demo, from);
  const series = buildSeries(demo, from);
  const last = series[series.length - 1];
  check(`Serie endet beim Depotwert (${from ?? 'Max'})`, last.depot, res.endValue, 0.01);
  check(`Serie endet beim Schattendepot (${from ?? 'Max'})`, last.benchmark, res.benchmark!.endValue, 0.01);
  console.log(
    `  ${from ?? 'Max'}: Wert ${res.endValue.toFixed(0)} €, Gewinn ${res.gain.toFixed(0)} €, IRR ${(res.irr! * 100).toFixed(2)} %, ` +
      `Benchmark ${res.benchmark!.endValue.toFixed(0)} € / ${(res.benchmark!.irr! * 100).toFixed(2)} %`,
  );
}
for (const p of analyzePositions(demo)) {
  console.log(`  ${p.instrument.shortName}: ${p.value.toFixed(0)} € (${(p.share * 100).toFixed(1)} %), IRR ${(p.irr! * 100).toFixed(2)} %`);
}

// Hinweis-Regeln mit konstruierten Depots (konstante Kurse von 100 €)
const flat = (isin: string) => ['2025-01-01', '2025-06-01', '2026-01-01', '2026-06-01', '2026-11-01'].map((date) => ({ date, price: 100 }));
const makeData = (transactions: Transaction[], asOf = '2026-11-04'): PortfolioData => ({
  instruments: [
    { isin: 'ETF', name: 'ETF', shortName: 'ETF', kind: 'ETF' },
    { isin: 'AKTIE', name: 'Aktie', shortName: 'Aktie', kind: 'Aktie' },
  ],
  transactions,
  prices: { ETF: flat('ETF'), AKTIE: flat('AKTIE') },
  benchmark: { isin: 'ETF', name: 'ETF' },
  asOf,
  source: { kind: 'demo' },
});
const buyTx = (date: string, isin: string, quantity: number): Transaction => ({ date, isin, type: 'buy', quantity, amount: quantity * 100, fees: 0 });

const twelvePct = makeData([buyTx('2025-02-01', 'ETF', 88), buyTx('2025-02-01', 'AKTIE', 12)]);
check('Klumpen bei 12 %', concentration(analyzePositions(twelvePct)).length, 1);
const eightPct = makeData([buyTx('2025-02-01', 'ETF', 92), buyTx('2025-02-01', 'AKTIE', 8)]);
check('Kein Klumpen bei 8 %', concentration(analyzePositions(eightPct)).length, 0);
check('Rücksetzer bei konstanten Kursen', drawdownOfCurrentHoldings(twelvePct).drop, 0);

check('Meilenstein 48.887 → 50.000', nextMilestone(48_887).next, 50_000);
check('Meilenstein 99.999 → 100.000', nextMilestone(99_999).next, 100_000);
check('Meilenstein 100.000 → 125.000', nextMilestone(100_000).next, 125_000);

const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
check('Serie 6 Monate', savingsStreak(makeData(months.map((m) => buyTx(`${m}-02`, 'ETF', 1)))), 6);
check('Serie bricht bei Lücke', savingsStreak(makeData(months.filter((m) => m !== '2026-08').map((m) => buyTx(`${m}-02`, 'ETF', 1)))), 3);
check(
  'Serie: laufender Monat darf fehlen',
  savingsStreak(makeData(months.slice(0, 5).map((m) => buyTx(`${m}-02`, 'ETF', 1)), '2026-11-01')),
  5,
);

// Realisierte Gewinne nach FIFO und Jahresübersicht
{
  const tx = (date: string, type: Transaction['type'], quantity: number, amount: number, fees = 0): Transaction => ({ date, isin: 'ETF', type, quantity, amount, fees });
  const txs = [
    tx('2024-03-01', 'buy', 10, 1000, 10), // 101 € je Stück
    tx('2024-09-02', 'buy', 10, 2000), // 200 € je Stück
    tx('2025-02-03', 'sell', 15, 3000, 5), // 10 × 101 + 5 × 200 = 2010 Einstand, Erlös 2995
    tx('2025-05-05', 'dividend', 0, 40),
  ];
  const r = realizedSales(txs);
  check('FIFO: Einstand der verkauften Anteile', r.sales[0].cost, 2010);
  check('FIFO: realisierter Gewinn', r.sales[0].gain, 985);
  check('FIFO: Einstand des Rests', r.openCost.get('ETF')!, 1000);
  // Verkauf ohne bekannte Käufe: weder Gewinn noch Verlust
  check('FIFO: Verkauf ohne Kaufhistorie', realizedSales([tx('2025-01-02', 'sell', 5, 500)]).sales[0].gain, 0);
  // Kauf und Verkauf am selben Tag, Verkauf zuerst in der Liste
  check('FIFO: gleicher Tag', realizedSales([tx('2025-01-02', 'sell', 5, 600), tx('2025-01-02', 'buy', 5, 500)]).sales[0].gain, 100);

  const data: PortfolioData = {
    instruments: [{ isin: 'ETF', name: 'ETF', shortName: 'ETF', kind: 'ETF' }],
    transactions: txs,
    prices: { ETF: [{ date: '2024-03-01', price: 100 }, { date: '2024-12-31', price: 210 }, { date: '2025-02-03', price: 200 }, { date: '2025-11-03', price: 220 }] },
    benchmark: null,
    asOf: '2025-11-04',
    source: { kind: 'demo' },
  };
  const { years, total } = analyzeYears(data);
  check('Jahre: Anzahl', years.length, 2);
  check('Jahre: neuestes zuerst', years[0].year, 2025);
  check('Jahre: 2024 gekauft', years[1].bought, 3010);
  check('Jahre: 2024 Endwert', years[1].endValue, 4200);
  check('Jahre: 2024 Gewinn', years[1].gain, 1190);
  check('Jahre: 2025 Startwert = Endwert 2024', years[0].startValue, years[1].endValue);
  check('Jahre: 2025 verkauft', years[0].sold, 2995);
  check('Jahre: 2025 realisiert', years[0].realized, 985);
  check('Jahre: 2025 Ausschüttungen', years[0].dividends, 40);
  // 4200 → Verkauf zu 200 (−4,76 %), Rest 5 Stück 1000 → 1100 (+10 %), dazu Gebühr und Ausschüttung
  check('Jahre: 2025 Gewinn', years[0].gain, 1100 - 4200 + 2995 + 40);
  check('Jahre: Summe der Jahresgewinne = Gesamtgewinn', years[0].gain + years[1].gain, total.gain, 1e-6);
  check('Gesamt: Buchgewinn', total.open, 100);
  check('Gesamt: realisiert', total.realized, 985);

  // Demo-Depot: Jahresgewinne ergeben zusammen den Gewinn seit Beginn
  const demoYears = analyzeYears(demo);
  check('Demo: Jahresgewinne = Gewinn seit Beginn', demoYears.years.reduce((s, y) => s + y.gain, 0), analyzePeriod(demo, null).gain, 0.01);
  check('Demo: Buchgewinn + realisiert + Ausschüttungen = Gewinn seit Beginn', demoYears.total.gain, analyzePeriod(demo, null).gain, 0.01);
  for (const y of demoYears.years) {
    console.log(`  ${y.year}: Rendite ${((y.twr ?? 0) * 100).toFixed(1)} %, MSCI ${((y.benchmarkReturn ?? 0) * 100).toFixed(1)} %, Gewinn ${y.gain.toFixed(0)} €, realisiert ${y.realized.toFixed(0)} €`);
  }
}

// Sparplan-Erkennung und Hochrechnung
{
  const s = detectSavings(demo); // asOf 2026-11-04, Sparpläne am 2. des Monats: 300 € und 75 €
  check('Sparplan Demo: zwei Pläne', s.plans.length, 2);
  check('Sparplan Demo: Rate', s.monthlyRate, 375, 0.5);
  check('Sparplan Demo: dieses Jahr', s.investedThisYear, 11 * 375, 1);
  // Kauf im laufenden Monat steht noch aus
  check('Sparplan: laufender Monat darf fehlen', detectSavings(createDemoData('2026-11-01')).monthlyRate, 375, 0.5);

  const plan = (months: string[], amount = 100): Transaction[] => months.map((m) => ({ date: `${m}-05`, isin: 'ETF', type: 'buy' as const, quantity: 1, amount, fees: 0 }));
  check('Sparplan: 3 von 4 Monaten reichen', detectSavings(makeData(plan(['2026-07', '2026-08', '2026-10']))).monthlyRate, 100);
  check('Sparplan: 2 Monate reichen nicht', detectSavings(makeData(plan(['2026-09', '2026-10']))).monthlyRate, 0);
  check('Sparplan: beendeter Plan zählt nicht', detectSavings(makeData(plan(['2026-03', '2026-04', '2026-05', '2026-06']))).monthlyRate, 0);
  // Ein großer Einzelkauf verfälscht die Rate nicht
  const withBig = [...plan(['2026-08', '2026-09', '2026-10', '2026-11']), ...plan(['2026-09'], 5000).map((t) => ({ ...t, date: '2026-09-20' }))];
  check('Sparplan: Einzelkauf zählt nicht zur Rate', detectSavings(makeData(withBig)).monthlyRate, 100);
  check('Sparplan: Einzelkäufe allein sind kein Plan', detectSavings(makeData(plan(['2026-09'], 5000))).plans.length, 0);
  // Zwei Ausführungen pro Monat
  const twice = [...plan(['2026-08', '2026-09', '2026-10']), ...plan(['2026-08', '2026-09', '2026-10']).map((t) => ({ ...t, date: t.date.slice(0, 8) + '20' }))];
  check('Sparplan: zwei Ausführungen pro Monat', detectSavings(makeData(twice)).monthlyRate, 200);

  // Selbst markiert: zählt sofort mit dem letzten Kauf
  const fresh = plan(['2026-10'], 150);
  check('Markiert: ohne Markierung kein Plan', detectSavings(makeData(fresh)).monthlyRate, 0);
  const markedNow = detectSavings(makeData(fresh), ['ETF']);
  check('Markiert: zählt ab dem ersten Kauf', markedNow.monthlyRate, 150);
  check('Markiert: Quelle', markedNow.plans[0].source === 'manual' ? 1 : 0, 1);
  const stale = detectSavings(makeData(plan(['2026-08'], 150)), ['ETF']);
  check('Markiert, aber nicht mehr bespart: zählt nicht', stale.monthlyRate, 0);
  check('Markiert, aber nicht mehr bespart: als inaktiv gemeldet', stale.inactive.length, 1);
  check('Markiert ohne Kauf: inaktiv', detectSavings(makeData([]), ['ETF']).inactive.length, 1);
  const both = detectSavings(makeData(plan(['2026-08', '2026-09', '2026-10'])), ['ETF']);
  check('Markiert und erkannt: nicht doppelt', both.monthlyRate, 100);
  check('Markiert und erkannt: Quelle auto', both.plans[0].source === 'auto' ? 1 : 0, 1);
  check('Ziel: höhere Rendite ist nicht langsamer', projectGoal(1000, 5000, 50, '2026-11-04', 0.08).withReturn! <= projectGoal(1000, 5000, 50, '2026-11-04', 0.03).withReturn! ? 1 : 0, 1);
  check('Ziel: 0 % Rendite = ohne Kursgewinne', projectGoal(1000, 5000, 50, '2026-11-04', 0).withReturn === projectGoal(1000, 5000, 50, '2026-11-04').withoutReturn ? 1 : 0, 1);

  check('Ziel: schon erreicht', monthsToGoal(1000, 900, 0, 0.05), 0);
  check('Ziel: nur Einzahlungen', monthsToGoal(1000, 2000, 100, 0), 10);
  check('Ziel: ohne Rate und ohne Rendite nie', monthsToGoal(1000, 2000, 0, 0) === null ? 1 : 0, 1);
  // 10.000 € bei 5 % p.a. ohne Einzahlung: nach 12 Monaten 10.500 €
  check('Ziel: nur Rendite', monthsToGoal(10000, 10499.99, 0, 0.05), 12);
  const proj = projectGoal(1000, 2000, 100, '2026-11-04');
  check('Ziel: Fortschritt', proj.progress, 0.5);
  check('Ziel: Monat ohne Kursgewinne', proj.withoutReturn === '2027-09' ? 1 : 0, 1);
  check('Ziel: mit Rendite nicht später', proj.withReturn! <= proj.withoutReturn! ? 1 : 0, 1);
  // Durchschnitts-Rendite einer Kursreihe (echte Vergleichslinien in der Hochrechnung)
  check(
    'Schnitt: Verdopplung in 10 Jahren ≈ 7,2 %',
    averageAnnualReturn([{ date: '2016-01-01', price: 100 }, { date: '2026-01-01', price: 200 }])!,
    Math.pow(2, 365.25 / 3653) - 1,
    1e-9,
  );
  check('Schnitt: unter drei Jahren kein Durchschnitt', averageAnnualReturn([{ date: '2025-01-01', price: 100 }, { date: '2026-01-01', price: 150 }]) === null ? 1 : 0, 1);
  check('Schnitt: leere Reihe', averageAnnualReturn([]) === null ? 1 : 0, 1);

  // Korridor-Diagramm
  const corridorSeries = projectSeries(1000, 2000, 100, 0, 12);
  check('Korridor: Start heute', corridorSeries[0], 1000);
  check('Korridor: ohne Rendite wächst um die Rate', corridorSeries[5], 1500);
  check('Korridor: am Ziel gedeckelt', Math.max(...corridorSeries), 2000);
  check('Korridor: Linie endet am Ziel statt flach weiterzulaufen', corridorSeries.length, 11);
  check('Korridor: ohne Ankunft volle Länge', projectSeries(1000, 1_000_000, 0, 0, 12).length, 13);
  check('Korridor: Zeitraum endet mit der langsamsten Linie', corridorMonths(1000, 5000, 100, [0.05, 0.02]), monthsToGoal(1000, 5000, 100, 0.02)!);
  check('Korridor: mindestens ein Jahr', corridorMonths(1000, 1100, 100, [0.05]), 12);
  check('Korridor: Unerreichbares wird auf 25 Jahre begrenzt', corridorMonths(1000, 10_000_000, 0, [0.03]), 300);

  // Jahres-Beiträge: die Summe der Positions-Beiträge ist der Jahres-Gewinn
  for (const y of analyzeYears(demo).years.slice(0, 2)) {
    check(`Beiträge ${y.year}: Summe = Jahres-Gewinn`, yearContributions(demo, y).reduce((s, c) => s + c.gain, 0), y.gain, 3);
  }
  const singlePos = makeData([buyTx('2025-02-01', 'ETF', 10)]);
  const singleYear = analyzeYears(singlePos).years.find((y) => y.year === 2025)!;
  check('Beiträge: eine Position trägt alles', yearContributions(singlePos, singleYear)[0]?.gain ?? 0, singleYear.gain, 1e-6);
}

// Top-Bewegungen: Beitrag zum Depot = Gewicht der Firma × Tagesbewegung ihrer Aktie
{
  const slice = (key: string, weight: number) => ({ key, label: key, weight, sector: '', country: '', sources: 1 });
  const cache = {
    quotedAt: '2026-11-20T21:00:00.000Z',
    symbols: { APPLE: 'AAPL', NVIDIA: 'NVDA' },
    quotes: { APPLE: { change: 0.01, date: '2026-11-19' }, NVIDIA: { change: -0.05, date: '2026-11-20' } },
  };
  const movers = computeMovers([slice('APPLE', 0.05), slice('NVIDIA', 0.04), slice('OHNE', 0.03)], cache);
  check('Bewegungen: größter Beitrag zuerst', movers.rows[0]?.contribution ?? 0, -0.002, 1e-12);
  check('Bewegungen: Firma ohne Kurs fehlt', movers.rows.length, 2);
  check('Bewegungen: Summe der Beiträge', movers.totalContribution, -0.0015, 1e-12);
  check('Bewegungen: abgedecktes Gewicht nur mit Kurs', movers.totalWeight, 0.09, 1e-12);
  check('Bewegungen: jüngster Handelstag', movers.date === '2026-11-20' ? 1 : 0, 1);
  check('Bewegungen: ohne Kurse leer', computeMovers([slice('APPLE', 0.05)], null).rows.length, 0);
}

// Entnahme-Modellrechnung
{
  const monthly = Math.pow(1.05, 1 / 12) - 1;
  // Kapitalerhalt: nach einem Jahr Entnehmen ist das Depot unverändert
  const preserve = capitalToPreserve(1000, 0.05)!;
  let value = preserve;
  for (let m = 0; m < 12; m++) value = value * (1 + monthly) - 1000;
  check('Entnahme: Kapitalerhalt lässt das Depot unverändert', value, preserve, 1e-6);
  check('Entnahme: ohne Rendite kein Kapitalerhalt', capitalToPreserve(1000, 0) === null ? 1 : 0, 1);
  check('Entnahme: ohne Betrag kein Ergebnis', capitalToPreserve(0, 0.05) === null ? 1 : 0, 1);
  check('Entnahme: Verzehr ohne Rendite = Monate mal Rate', capitalToConsume(1000, 0, 30)!, 360000);
  // Verzehr: nach genau 30 Jahren ist das Depot leer
  const consume = capitalToConsume(1000, 0.05, 30)!;
  value = consume;
  for (let m = 0; m < 360; m++) value = value * (1 + monthly) - 1000;
  check('Entnahme: Verzehr ist nach der Dauer aufgebraucht', value, 0, 0.01);
  check('Entnahme: Verzehr braucht weniger als Kapitalerhalt', consume < preserve ? 1 : 0, 1);
  check('Entnahme: mehr Rendite braucht weniger Depot', capitalToPreserve(1000, 0.07)! < preserve ? 1 : 0, 1);
  check('Entnahme: hin und zurück', monthlyFromCapital(capitalToPreserve(1234, 0.06)!, 0.06), 1234, 1e-9);
  check('Entnahme: leeres Depot trägt nichts', monthlyFromCapital(0, 0.05), 0);
  check('Entnahme: runden auf volle Tausender', roundCapital(981818.18), 982000);
  check('Entnahme: runden nie auf null', roundCapital(120), 1000);
}

// Zielaufteilung
{
  const pos = analyzePositions(makeData([buyTx('2025-02-01', 'ETF', 77), buyTx('2025-02-01', 'AKTIE', 23)]));
  const rows = analyzeAllocation(pos, { ETF: 0.7, AKTIE: 0.3 });
  check('Aufteilung: Abweichung ETF', rows.get('ETF')!.deviation, 0.07);
  check('Aufteilung: 7 Punkte sind ein Hinweis', rows.get('ETF')!.off ? 1 : 0, 1);
  check('Aufteilung: Abweichung Aktie', rows.get('AKTIE')!.deviation, -0.07);
  const near = analyzeAllocation(pos, { ETF: 0.75, AKTIE: 0.25 });
  check('Aufteilung: 2 Punkte sind kein Hinweis', near.get('ETF')!.off ? 1 : 0, 0);
  check('Aufteilung: genau 5 Punkte sind kein Hinweis', analyzeAllocation(pos, { ETF: 0.72 }).get('ETF')!.off ? 1 : 0, 0);
  check('Aufteilung: ohne Wunschanteil keine Zeile', analyzeAllocation(pos, { ETF: 0.7 }).has('AKTIE') ? 1 : 0, 0);
  check('Aufteilung: Hinweis erscheint', buildInsights(twelvePct, analyzePositions(twelvePct), false, analyzeAllocation(analyzePositions(twelvePct), { ETF: 0.7, AKTIE: 0.3 })).filter((i) => i.id.startsWith('allocation-')).length, 2);
  const demoTargets = currentAsTargets(analyzePositions(demo));
  check('Aufteilung: Vorschlag ergibt 100 %', Object.values(demoTargets).reduce((s, n) => s + n, 0), 100);
  const thirds = analyzePositions(makeData([buyTx('2025-02-01', 'ETF', 1), buyTx('2025-02-01', 'AKTIE', 2)]));
  check('Aufteilung: Vorschlag bei Drittel ergibt 100 %', Object.values(currentAsTargets(thirds)).reduce((s, n) => s + n, 0), 100);
}

// Rechnerischer Ausgleich: Zukauf-Verteilung zur Zielaufteilung
{
  // 7000 € ETF / 3000 € Aktie
  const pos = analyzePositions(makeData([buyTx('2025-02-01', 'ETF', 70), buyTx('2025-02-01', 'AKTIE', 30)]));
  const all = splitPurchase(pos, { ETF: 0.5, AKTIE: 0.5 }, 1000);
  check('Ausgleich: alles in die Position unter Ziel', all.find((s) => s.isin === 'AKTIE')!.amount, 1000);
  check('Ausgleich: nichts in die Position über Ziel', all.length, 1);
  const balanced = splitPurchase(pos, { ETF: 0.7, AKTIE: 0.3 }, 1000);
  check('Ausgleich: im Ziel wird nach Anteilen verteilt (ETF)', balanced.find((s) => s.isin === 'ETF')!.amount, 700);
  check('Ausgleich: im Ziel wird nach Anteilen verteilt (Aktie)', balanced.find((s) => s.isin === 'AKTIE')!.amount, 300);
  const equal = analyzePositions(makeData([buyTx('2025-02-01', 'ETF', 1), buyTx('2025-02-01', 'AKTIE', 1)]));
  check('Ausgleich: Rundung erhält die Summe', splitPurchase(equal, { ETF: 0.5, AKTIE: 0.5 }, 101).reduce((s, r) => s + r.amount, 0), 101);
  check('Ausgleich: Einmalbetrag bis zum Ziel', catchUpAmount(pos, { ETF: 0.5, AKTIE: 0.5 })!, 4000, 1e-6);
  check('Ausgleich: im Ziel ist nichts nötig', catchUpAmount(pos, { ETF: 0.7, AKTIE: 0.3 })!, 0, 1e-6);
  check('Ausgleich: 0 %-Ziel mit Bestand geht nicht ohne Verkauf', catchUpAmount(pos, { ETF: 1, AKTIE: 0 }) === null ? 1 : 0, 1);
  // Der Einmalbetrag, so verteilt, trifft das Ziel exakt (hier: alles in die Aktie → 7000/7000)
  check('Ausgleich: Einmalbetrag landet komplett unter Ziel', splitPurchase(pos, { ETF: 0.5, AKTIE: 0.5 }, 4000).find((s) => s.isin === 'AKTIE')!.amount, 4000);
}

// Monats-Rückblick
{
  const data: PortfolioData = {
    ...makeData([buyTx('2026-09-15', 'ETF', 10), { date: '2026-10-10', isin: 'ETF', type: 'buy', quantity: 2, amount: 220, fees: 1.5 }], '2026-11-03'),
    prices: { ETF: [{ date: '2026-08-31', price: 100 }, { date: '2026-09-30', price: 100 }, { date: '2026-10-31', price: 110 }], AKTIE: [{ date: '2026-08-31', price: 100 }] },
  };
  const review = reviewLastMonth(data)!;
  check('Rückblick: Startwert Ende September', review.startValue, 1000);
  check('Rückblick: Endwert Ende Oktober', review.endValue, 1320);
  check('Rückblick: eingezahlt inkl. Gebühren', review.invested, 221.5);
  check('Rückblick: Wertentwicklung = Rest', review.gain, 1320 - 1000 - 221.5);
  check('Rückblick: leeres Depot hat keinen Rückblick', reviewLastMonth(makeData([buyTx('2026-11-02', 'ETF', 1)], '2026-11-04')) === null ? 1 : 0, 1);
  check('Rückblick: Karte zu Monatsbeginn', reviewToShow(data) !== null ? 1 : 0, 1);
  // Erwartung hängt am Zeitfenster, damit der Test auch mit dem Test-Schalter (31 Tage) stimmt
  check('Rückblick: später im Monat keine Karte', reviewToShow({ ...data, asOf: '2026-11-12' }) === null ? 1 : 0, 12 > REVIEW_DAYS ? 1 : 0);
}

// Vorabpauschale-Vorschau
{
  const vorabData = (over: Partial<PortfolioData>): PortfolioData => ({
    instruments: [
      { isin: 'ETF', name: 'ETF', shortName: 'ETF', kind: 'ETF' },
      { isin: 'AKTIE', name: 'Aktie', shortName: 'Aktie', kind: 'Aktie' },
    ],
    transactions: [
      { date: '2024-02-01', isin: 'ETF', type: 'buy', quantity: 100, amount: 8000, fees: 0 },
      { date: '2024-02-01', isin: 'AKTIE', type: 'buy', quantity: 10, amount: 1000, fees: 0 },
    ],
    prices: {
      ETF: [{ date: '2024-01-05', price: 80 }, { date: '2025-12-31', price: 100 }, { date: '2026-12-31', price: 120 }],
      AKTIE: [{ date: '2024-01-05', price: 100 }],
    },
    benchmark: null,
    asOf: '2027-02-01',
    source: { kind: 'demo' },
    ...over,
  });
  const done = vorabData({});
  const est = estimateVorabpauschale(done, 2026)!;
  // 0,7 × 3,2 % × 100 € = 2,24 € je Anteil, Deckel 20 € greift nicht → 224 € auf 100 Anteile
  check('Vorab: Grundfall', est.total, 224, 1e-9);
  check('Vorab: Steuer mit Teilfreistellung und Soli', est.tax, 224 * 0.7 * 0.26375, 1e-9);
  check('Vorab: Aktien zählen nicht', est.items.length, 1);
  check('Vorab: Jahr abgeschlossen', est.running ? 1 : 0, 0);

  const capped = vorabData({ prices: { ...done.prices, ETF: [{ date: '2024-01-05', price: 80 }, { date: '2025-12-31', price: 100 }, { date: '2026-12-31', price: 100.5 }] } });
  check('Vorab: Deckel beim Wertzuwachs', estimateVorabpauschale(capped, 2026)!.total, 50, 1e-9);
  const down = vorabData({ prices: { ...done.prices, ETF: [{ date: '2024-01-05', price: 80 }, { date: '2025-12-31', price: 100 }, { date: '2026-12-31', price: 90 }] } });
  check('Vorab: Verlustjahr → 0', estimateVorabpauschale(down, 2026)!.total, 0);
  const div = (amount: number): Transaction => ({ date: '2026-06-15', isin: 'ETF', type: 'dividend', quantity: 0, amount, fees: 0 });
  check('Vorab: Ausschüttungen decken die Pauschale', estimateVorabpauschale(vorabData({ transactions: [...done.transactions, div(224)] }), 2026)!.total, 0);
  check('Vorab: Ausschüttungen mindern die Pauschale', estimateVorabpauschale(vorabData({ transactions: [...done.transactions, div(112)] }), 2026)!.total, 112, 1e-9);
  const midYear = vorabData({ transactions: [...done.transactions, { date: '2026-07-15', isin: 'ETF', type: 'buy', quantity: 50, amount: 5500, fees: 0 }] });
  // Kauf im Juli: 6 volle Monate davor → die Hälfte von 2,24 € × 50
  check('Vorab: Zwölftelung im Kaufjahr', estimateVorabpauschale(midYear, 2026)!.total, 224 + 56, 1e-9);
  const sold = vorabData({ transactions: [...done.transactions, { date: '2026-05-10', isin: 'ETF', type: 'sell', quantity: 60, amount: 6600, fees: 0 }] });
  check('Vorab: verkaufte Anteile zählen nicht', estimateVorabpauschale(sold, 2026)!.total, 2.24 * 40, 1e-9);
  check('Vorab: unbekanntes Jahr → keine Vorschau', estimateVorabpauschale(done, 2030) === null ? 1 : 0, 1);
  check('Vorab: negativer Basiszins → 0', estimateVorabpauschale(done, 2021)!.total, 0);
  const runningYear = vorabData({ asOf: '2026-11-12', prices: { ...done.prices, ETF: [{ date: '2024-01-05', price: 80 }, { date: '2025-12-31', price: 100 }, { date: '2026-11-06', price: 118 }] } });
  const run = estimateVorabpauschale(runningYear, 2026)!;
  check('Vorab: laufendes Jahr mit heutigem Kurs', run.total, 224, 1e-9);
  check('Vorab: laufendes Jahr markiert', run.running ? 1 : 0, 1);
  check('Vorab: im Januar zählt das Vorjahr', pauschaleYear('2027-01-15'), 2026);
  check('Vorab: sonst das laufende Jahr', pauschaleYear('2026-11-12'), 2026);
  const hasVorab = (d: PortfolioData) => (buildInsights(d, analyzePositions(d)).some((i) => i.id === 'vorabpauschale') ? 1 : 0);
  check('Vorab: kein Hinweis im November', hasVorab(runningYear), 0);
  check('Vorab: Hinweis im Dezember', hasVorab({ ...runningYear, asOf: '2026-12-15' }), 1);
  const january = vorabData({ asOf: '2027-01-10' });
  check('Vorab: Hinweis im Januar fürs Vorjahr', buildInsights(january, analyzePositions(january)).some((i) => i.id === 'vorabpauschale' && String(i.parts[0]).includes('2026') && String(i.parts[0]).includes('2027')) ? 1 : 0, 1);
  check('Vorab: kein Hinweis ohne Kursanstieg', hasVorab({ ...done, asOf: '2026-12-15', prices: { ...done.prices, ETF: [{ date: '2024-01-05', price: 80 }, { date: '2025-12-31', price: 100 }, { date: '2026-11-06', price: 100 }] } }), 0);
}

console.log('  Hinweise Demo:');
for (const i of buildInsights(demo, analyzePositions(demo))) {
  console.log(`   [${i.tone}] ${i.parts.map((p) => (typeof p === 'string' ? p : `${Math.round(p.amount)} €`)).join(' ')}`);
}

process.exit(failed ? 1 : 0);
