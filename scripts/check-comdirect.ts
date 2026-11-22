// Prüft Anmeldung, Datenabruf und Mapping gegen ein nachgebautes comdirect-API: npx tsx scripts/check-comdirect.ts
import { assertAllowed, ComdirectApi } from '../src/comdirect/api';
import { takeSnapshot, visitChange } from '../src/finance/visit';
import { ComdirectLogin } from '../src/comdirect/login';
import { fetchRawPortfolio, mapPortfolio, mergeTransactions, RawPortfolio, snapshotOf } from '../src/comdirect/portfolio';
import { analyzePeriod, analyzePositions, buildSeries } from '../src/finance/performance';
import { CASH, flexibleNumber, OTHER, parseHoldings, splitCsvLine } from '../src/data/holdingsImport';
import { industryBreakdown, industryInfo } from '../src/finance/industries';
import { findIndustry, loadIndustries } from '../src/market/industries';
import { analyzeOverlap } from '../src/finance/overlap';
import { assignHoldings, describeFund, matchScore } from '../src/finance/holdingsMatch';
import { analyzeComposition, companyKey, displayName, UNKNOWN } from '../src/finance/composition';
import { backupDue, mergeLists, mergeSettings, mergeStored, NO_LISTS, NO_SETTINGS, parseBackup, parseBackupLists, parseBackupSettings, serializeBackup } from '../src/data/backupFormat';
import { addCsvTransactions, decodeCsv, germanNumber, instrumentFromText, knownInstrumentIds, parseComdirectCsv, parseDepotCsv } from '../src/data/csvImport';
import { buildTransactionsCsv, buildYearReportHtml } from '../src/data/report';
import type { YearsOverview } from '../src/finance/years';
import type { PortfolioData } from '../src/types';
import { loadMovers, MAX_MOVERS, moversStale } from '../src/market/movers';
import { BENCHMARK, BENCHMARKS, fetchChart, findSymbol, loadMarketData, loadQuotes, needsRefresh, quotesStale } from '../src/market/yahoo';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
}

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

/** Nachgebautes comdirect: antwortet je nach Methode und Pfad, protokolliert alle Aufrufe. */
function mockComdirect(typ: 'P_TAN_PUSH' | 'P_TAN', pushStatuses: string[] = []) {
  const calls: Call[] = [];
  const json = (body: unknown, headers: Record<string, string> = {}, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

  const fetchImpl = async (url: string, init: RequestInit = {}) => {
    const call = { method: init.method ?? 'GET', url, headers: (init.headers ?? {}) as Record<string, string>, body: init.body as string | undefined };
    calls.push(call);
    const path = url.replace('https://api.comdirect.de', '');
    if (path === '/oauth/token') {
      const grant = new URLSearchParams(call.body).get('grant_type');
      return json({ access_token: grant === 'password' ? 'primary' : 'secondary', refresh_token: 'r', expires_in: 599 });
    }
    if (path === '/oauth/revoke') return new Response(null, { status: 204 });
    if (path === '/api/session/clients/user/v1/sessions') return json([{ identifier: 'SESSION1', sessionTanActive: false, activated2FA: false }]);
    if (path.endsWith('/validate')) {
      const info = { id: 'CH1', typ, availableTypes: ['P_TAN_PUSH', 'P_TAN'], challenge: typ === 'P_TAN' ? 'iVBORw0K' : undefined, link: { href: '/api/session/v1/authentications/CH1', rel: 'self', method: 'GET' } };
      return json({ identifier: 'SESSION1' }, { 'x-once-authentication-info': JSON.stringify(info) }, 201);
    }
    if (path.startsWith('/api/session/v1/authentications/')) return json({ authenticationId: 'CH1', status: pushStatuses.shift() ?? 'PENDING' });
    if (call.method === 'PATCH') return json({ identifier: 'SESSION1', sessionTanActive: true, activated2FA: true });
    return json({}, {}, 404);
  };
  return { calls, api: new ComdirectApi(fetchImpl, 'abcdef0123456789abcdef0123456789') };
}

const credentials = { clientId: 'User_X', clientSecret: 'secret', username: '12345678', pin: '123456' };

async function main() {
  // --- Anmeldung mit photoTAN-Push ---
  {
    const { calls, api } = mockComdirect('P_TAN_PUSH', ['PENDING', 'AUTHENTICATED']);
    const login = new ComdirectLogin(api, credentials);
    const challenge = await login.start();
    check('Push: Challenge-Typ erkannt', challenge.typ === 'P_TAN_PUSH');

    const form = new URLSearchParams(calls[0].body);
    check('Password-Grant mit allen Feldern', form.get('grant_type') === 'password' && form.get('username') === '12345678' && form.get('password') === '123456' && form.get('client_id') === 'User_X');
    check('Token-Aufruf als Formular', calls[0].headers['Content-Type'] === 'application/x-www-form-urlencoded');

    const info = JSON.parse(calls[1].headers['x-http-request-info']);
    check('Request-Info: Session-Id 32 Hex', /^[0-9a-f]{32}$/.test(info.clientRequestId.sessionId));
    check('Request-Info: Request-Id 9 Ziffern', /^\d{9}$/.test(info.clientRequestId.requestId));
    check('Request-Ids eindeutig', new Set(calls.filter((c) => c.headers['x-http-request-info']).map((c) => JSON.parse(c.headers['x-http-request-info']).clientRequestId.requestId)).size === calls.filter((c) => c.headers['x-http-request-info']).length);
    check('Validate mit Session-Body', calls[2].url.endsWith('/sessions/SESSION1/validate') && JSON.parse(calls[2].body!).sessionTanActive === true);

    let secondStart = false;
    await login.start().catch(() => (secondStart = true));
    check('Keine zweite Challenge pro Anmeldung', secondStart && calls.filter((c) => c.url.endsWith('/validate')).length === 1);

    const approved = await login.waitForPush(new AbortController().signal, 1);
    check('Push-Freigabe per Status-Abfrage erkannt', approved);

    const token = await login.complete();
    const patch = calls.find((c) => c.method === 'PATCH')!;
    check('Aktivierung mit Challenge-Id', JSON.parse(patch.headers['x-once-authentication-info']).id === 'CH1');
    check('Push: kein TAN-Header', !('x-once-authentication' in patch.headers));
    const secondary = new URLSearchParams(calls[calls.length - 1].body);
    check('cd_secondary mit erstem Token', secondary.get('grant_type') === 'cd_secondary' && secondary.get('token') === 'primary');
    check('Banking-Token erhalten', token.accessToken === 'secondary');
  }

  // --- Anmeldung mit photoTAN-Grafik ---
  {
    const { calls, api } = mockComdirect('P_TAN');
    const login = new ComdirectLogin(api, credentials);
    const challenge = await login.start();
    check('P_TAN: Grafik geliefert', challenge.challenge === 'iVBORw0K');
    let missingTan = false;
    await login.complete().catch(() => (missingTan = true));
    check('P_TAN: ohne TAN abgelehnt, ohne Aufruf', missingTan && !calls.some((c) => c.method === 'PATCH'));
    await login.complete('654321');
    const patch = calls.find((c) => c.method === 'PATCH')!;
    check('P_TAN: TAN im Header', patch.headers['x-once-authentication'] === '654321');
  }

  // --- Datenabruf mit Paging ---
  {
    const pages = [
      { paging: { index: 0, matches: 3 }, values: [{ id: 1 }, { id: 2 }] },
      { paging: { index: 2, matches: 3 }, values: [{ id: 3 }] },
    ];
    const urls: string[] = [];
    const api = new ComdirectApi(async (url) => {
      urls.push(url);
      const body = url.includes('/v3/depots?') || url.endsWith('/v3/depots')
        ? { values: [{ depotId: 'D1' }] }
        : url.includes('/positions')
          ? { values: [{ quantity: { value: '1' } }] }
          : pages.shift() ?? { values: [] };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const raw = await fetchRawPortfolio(api, 'secondary');
    check('Paging: alle Umsätze geholt', raw.transactions.length === 3, `${raw.transactions.length}`);
    check('Paging: zweite Seite ab Treffer 2', urls.some((u) => u.includes('paging-first=2')));
    check('Positionen mit Instrument-Daten', urls.some((u) => u.includes('/positions?with-attr=instrument')));
    check('Umsätze mit min-bookingDate angefragt', urls.some((u) => u.includes('/transactions?min-bookingDate=')));
  }

  // --- comdirect lehnt den Datumsfilter ab → erneut ohne Filter ---
  {
    const urls: string[] = [];
    const api = new ComdirectApi(async (url) => {
      urls.push(url);
      if (url.includes('min-bookingDate')) return new Response('{}', { status: 400 });
      const body = url.endsWith('/v3/depots') ? { values: [{ depotId: 'D1' }] } : url.includes('/positions') ? { values: [] } : { paging: { matches: 1 }, values: [{ id: 1 }] };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const raw = await fetchRawPortfolio(api, 'secondary');
    check('Fallback ohne Datumsfilter', raw.transactions.length === 1 && urls.some((u) => u.includes('/transactions?paging-first=0')));
  }

  // --- Mapping (Beträge als Strings, wie in der Doku) ---
  {
    const world = { isin: 'IE00B4L5Y983', wkn: 'A0RPWH', name: 'iShares Core MSCI World', shortName: 'MSCI World', staticData: { instrumentType: 'ETF' } };
    const share = { isin: 'DE0008404005', wkn: '840400', name: 'Allianz SE', shortName: 'Allianz', staticData: { instrumentType: 'SHARE' } };
    const raw: RawPortfolio = {
      positions: [
        { quantity: { value: '30', unit: 'XXX' }, currentPrice: { price: { value: '110.00', unit: 'EUR' } }, purchasePrice: { value: '90.00' }, currentValue: { value: '3300.00' }, instrument: world },
        // Aktie ohne Umsätze in der Historie → Eröffnungskauf zum Anschaffungskurs
        { quantity: { value: '5', unit: 'XXX' }, currentPrice: { price: { value: '300.00' } }, purchasePrice: { value: '200.00' }, currentValue: { value: '1500.00' }, instrument: share },
      ],
      transactions: [
        { bookingStatus: 'BOOKED', bookingDate: '2025-01-02', quantity: { value: '20' }, executionPrice: { value: '90.00' }, transactionValue: { value: '1800.00' }, transactionType: { key: 'BUY' }, instrument: world },
        { bookingStatus: 'BOOKED', bookingDate: '2025-06-02', quantity: { value: '10' }, executionPrice: { value: '100.00' }, transactionValue: { value: '1000.00' }, transactionType: { key: 'BUY' }, instrument: world },
        { bookingStatus: 'NOTBOOKED', bookingDate: null, businessDate: '2026-11-03', quantity: { value: '5' }, executionPrice: { value: '110.00' }, transactionValue: { value: '550.00' }, transactionType: { key: 'BUY' }, instrument: world },
      ],
    };
    const data = mapPortfolio(raw, [], '2026-11-04', '2026-11-04T10:00:00.000Z');
    check('Nicht gebuchte Umsätze ignoriert', !data.transactions.some((t) => t.date === '2026-11-03'));
    check('Kauf mit Betrag aus transactionValue', data.transactions.some((t) => t.isin === world.isin && t.amount === 1800));
    const opening = data.transactions.find((t) => t.isin === share.isin);
    check('Fehlende Historie: Eröffnungskauf ergänzt', opening?.quantity === 5 && opening.amount === 1000 && opening.date === '2025-01-02');
    const kinds = Object.fromEntries(data.instruments.map((i) => [i.shortName, i.kind]));
    check('Wertpapierart erkannt', kinds['MSCI World'] === 'ETF' && kinds['Allianz'] === 'Aktie');

    const result = analyzePeriod(data, null);
    check('Depotwert = Summe currentValue', Math.abs(result.endValue - 4800) < 1e-6, result.endValue.toFixed(2));
    check('Gewinn = Wert − Einsatz', Math.abs(result.gain - (4800 - 1800 - 1000 - 1000)) < 1e-6, result.gain.toFixed(2));
    check('Ohne Benchmark kein Vergleich', result.benchmark === null);
    const positions = analyzePositions(data);
    check('Positionen bewertet', positions.length === 2 && Math.abs(positions[0].value - 3300) < 1e-6);

    const snap = snapshotOf(raw, '2026-11-04');
    check('Snapshot mit aktuellen Kursen', snap.prices[world.isin] === 110 && snap.prices[share.isin] === 300);
    const later = mapPortfolio(raw, [{ date: '2026-08-01', prices: { [world.isin]: 95 } }], '2026-11-04', '2026-11-04T10:00:00.000Z');
    check('Frühere Abrufe fließen in den Kursverlauf', later.prices[world.isin].some((p) => p.date === '2026-08-01' && p.price === 95));

    // Einstandswert laut Bank (inkl. Gebühren) für „seit Kauf“ und den Eröffnungskauf
    const withCost: RawPortfolio = {
      ...raw,
      positions: [raw.positions[0], { ...raw.positions[1], purchaseValue: { value: '1010.00', unit: 'EUR' } }],
    };
    const costed = mapPortfolio(withCost, [], '2026-11-04', '2026-11-04T10:00:00.000Z');
    check('Einstandswert übernommen', costed.costBasis?.[share.isin] === 1010 && costed.costBasis?.[world.isin] === undefined);
    check('Eröffnungskauf zum Einstandswert inkl. Gebühren', costed.transactions.find((t) => t.isin === share.isin)?.amount === 1010);
  }

  // --- Umsätze über Abrufe hinweg zusammenführen ---
  {
    const tx = (id: string | undefined, date: string, status = 'BOOKED') => ({
      transactionId: id,
      bookingStatus: status,
      bookingDate: date,
      quantity: { value: '1' },
      transactionValue: { value: '100' },
      transactionType: { key: 'BUY' },
      instrument: { isin: 'X' },
    });
    const stored = [tx('A', '2025-01-01'), tx('B', '2026-06-01'), tx(undefined, '2025-02-01'), tx('P', '2026-06-02', 'NOTBOOKED')];
    const fresh = [tx('B', '2026-06-01'), tx('C', '2026-10-01'), tx(undefined, '2025-02-01')];
    const merged = mergeTransactions(stored, fresh);
    const ids = merged.map((t) => t.transactionId ?? t.bookingDate).sort();
    check('Alte Umsätze bleiben, keine Doppelten', JSON.stringify(ids) === JSON.stringify(['2025-02-01', 'A', 'B', 'C']), ids.join(','));

    // --- Sicherung: Datei hin und zurück, Zusammenführen mit dem aktuellen Stand ---
    const backupStored = { raw: { positions: [{ quantity: { value: '1' } }], transactions: stored }, fetchedAt: '2026-06-03T10:00:00.000Z', snapshots: [{ date: '2026-06-03', prices: { X: 90 } }] };
    const currentStored = { raw: { positions: [{ quantity: { value: '2' } }], transactions: fresh }, fetchedAt: '2026-11-07T10:00:00.000Z', snapshots: [{ date: '2026-11-07', prices: { X: 110 } }] };
    const roundTrip = parseBackup(serializeBackup(backupStored, '2026-06-03T11:00:00.000Z'));
    check('Sicherung: Datei hin und zurück', JSON.stringify(roundTrip) === JSON.stringify(backupStored));
    const settings = { goal: 100000, assumedReturn: 0.065, savingsMarks: ['IE00B4L5Y983'], targetShares: { IE00B4L5Y983: 0.7, US0378331005: 0.3 }, withdrawal: { monthly: 1500, years: 30 }, notes: { IE00B4L5Y983: 'Weltweit gestreut, Basis des Depots' } };
    const withSettings = serializeBackup(backupStored, 'x', settings);
    check('Sicherung: Einstellungen hin und zurück', JSON.stringify(parseBackupSettings(withSettings)) === JSON.stringify(settings));
    check('Sicherung: Depotdaten trotz Einstellungen unverändert', JSON.stringify(parseBackup(withSettings)) === JSON.stringify(backupStored));
    check('Sicherung: alte Datei ohne Einstellungen', JSON.stringify(parseBackupSettings(serializeBackup(backupStored, 'x'))) === JSON.stringify(NO_SETTINGS));
    const odd = parseBackupSettings(
      JSON.stringify({ app: 'depot-tracker', version: 1, settings: { goal: 'viel', assumedReturn: 7, savingsMarks: ['A', 5], targetShares: { A: 0.6, B: 'x', C: 3 }, withdrawal: { monthly: 'x', years: 30 } } }),
    );
    check('Sicherung: unsinnige Einstellungen werden verworfen', odd.goal === null && odd.assumedReturn === null && odd.savingsMarks.join() === 'A' && JSON.stringify(odd.targetShares) === '{"A":0.6}' && odd.withdrawal === null);
    const mergedSettings = mergeSettings(
      { goal: 50000, assumedReturn: null, savingsMarks: ['A'], targetShares: {}, withdrawal: null, notes: { A: 'meine' } },
      { goal: 100000, assumedReturn: 0.07, savingsMarks: ['A', 'B'], targetShares: { A: 1 }, withdrawal: { monthly: 2000, years: 25 }, notes: { A: 'alte', B: 'aus Sicherung' } },
    );
    check('Sicherung: eigene Notiz bleibt, fehlende kommt aus der Sicherung', mergedSettings.notes.A === 'meine' && mergedSettings.notes.B === 'aus Sicherung');
    check(
      'Sicherung: leere oder kaputte Notizen werden verworfen',
      JSON.stringify(parseBackupSettings(JSON.stringify({ app: 'depot-tracker', version: 1, settings: { notes: { A: 'gut', B: '   ', C: 5 } } })).notes) === '{"A":"gut"}',
    );
    check('Sicherung: fehlende Wunsch-Entnahme kommt aus der Sicherung', mergedSettings.withdrawal?.monthly === 2000 && mergedSettings.withdrawal.years === 25);
    check(
      'Sicherung: vorhandene Wunsch-Entnahme bleibt',
      mergeSettings({ ...NO_SETTINGS, withdrawal: { monthly: 900, years: 40 } }, { ...NO_SETTINGS, withdrawal: { monthly: 2000, years: 25 } }).withdrawal?.monthly === 900,
    );
    check('Sicherung: fehlende Zielaufteilung kommt aus der Sicherung', mergedSettings.targetShares.A === 1);
    check('Sicherung: vorhandene Zielaufteilung bleibt', mergeSettings({ ...NO_SETTINGS, targetShares: { B: 1 } }, { ...NO_SETTINGS, targetShares: { A: 1 } }).targetShares.B === 1);
    check('Sicherung: vorhandenes Ziel bleibt, Fehlendes wird ergänzt', mergedSettings.goal === 50000 && mergedSettings.assumedReturn === 0.07 && mergedSettings.savingsMarks.join() === 'A,B');
    check('Sicherung: keine Zugangsdaten in der Datei', !/clientSecret|pin|username/i.test(serializeBackup(backupStored, 'x')));

    // --- Sicherung: ETF-Listen und Branchen-Zwischenspeicher ---
    const fundOld = { importedAt: '2026-10-01T00:00:00.000Z', asOf: '2026-09-30', count: 2, sectors: {}, countries: {}, top: [] };
    const fundNew = { ...fundOld, importedAt: '2026-11-01T00:00:00.000Z' };
    const lists = { compositions: { IE1: fundOld }, industries: { apple: { industry: 'Consumer Electronics', checkedAt: '2026-10-01' } } };
    const withLists = serializeBackup(backupStored, 'x', settings, lists);
    check('Sicherung: ETF-Listen hin und zurück', JSON.stringify(parseBackupLists(withLists)) === JSON.stringify(lists));
    check('Sicherung: Depotdaten trotz Listen unverändert', JSON.stringify(parseBackup(withLists)) === JSON.stringify(backupStored));
    check('Sicherung: alte Datei ohne Listen', JSON.stringify(parseBackupLists(serializeBackup(backupStored, 'x'))) === JSON.stringify(NO_LISTS));
    const mergedLists = mergeLists(
      { compositions: { IE1: fundOld }, industries: { apple: { industry: null, checkedAt: '2026-09-01' } } },
      { compositions: { IE1: fundNew, IE2: fundOld }, industries: { apple: { industry: 'Consumer Electronics', checkedAt: '2026-10-01' }, sap: { industry: 'Software', checkedAt: '2026-10-01' } } },
    );
    check('Sicherung: neuere ETF-Liste gewinnt, fehlende kommt dazu', mergedLists.compositions.IE1.importedAt === fundNew.importedAt && !!mergedLists.compositions.IE2);
    check('Sicherung: neuerer Branchen-Eintrag gewinnt', mergedLists.industries.apple.industry === 'Consumer Electronics' && !!mergedLists.industries.sap);
    const oddLists = parseBackupLists(
      JSON.stringify({ app: 'depot-tracker', version: 1, lists: { compositions: { X: { top: 'nein' }, Y: fundOld }, industries: { a: 'kaputt', b: { industry: null, checkedAt: '2026-01-01' } } } }),
    );
    check('Sicherung: kaputte Listen-Einträge werden verworfen', Object.keys(oddLists.compositions).join() === 'Y' && Object.keys(oddLists.industries).join() === 'b');
    let rejected = 0;
    for (const bad of ['kein json', '{"app":"andere-app"}', '{"app":"depot-tracker","version":99}', '{"app":"depot-tracker","version":1}']) {
      try {
        parseBackup(bad);
      } catch {
        rejected++;
      }
    }
    check('Sicherung: fremde oder kaputte Dateien abgelehnt', rejected === 4);
    const restored = mergeStored(currentStored, roundTrip);
    check('Wiederherstellen: Bestand vom neueren Abruf', restored.fetchedAt === currentStored.fetchedAt && restored.raw.positions[0].quantity.value === '2');
    check('Wiederherstellen: Umsätze aus beiden', restored.raw.transactions.length === 4);
    check('Wiederherstellen: Snapshots aus beiden', restored.snapshots.map((s) => s.date).join() === '2026-06-03,2026-11-07');
    check('Wiederherstellen ohne aktuellen Stand', mergeStored(null, roundTrip) === roundTrip);
  }

  // --- Berichte: Umsätze als CSV, Jahresübersicht als PDF-HTML ---
  {
    const data: PortfolioData = {
      instruments: [{ isin: 'IE1', name: 'Welt; "ETF"', shortName: 'Welt', kind: 'ETF' }],
      transactions: [
        { date: '2026-02-01', isin: 'IE1', type: 'buy', quantity: 1.5, amount: 150.5, fees: 1.9 },
        { date: '2026-01-01', isin: 'IE1', type: 'dividend', quantity: 0, amount: 10, fees: 0 },
      ],
      prices: {},
      benchmark: null,
      asOf: '2026-11-16',
      source: { kind: 'comdirect', fetchedAt: '2026-11-16T10:00:00.000Z' },
    };
    const csv = buildTransactionsCsv(data);
    check('Bericht: CSV beginnt mit BOM für Excel', csv.startsWith('﻿'));
    const lines = csv.slice(1).split('\n');
    check('Bericht: CSV-Kopf', lines[0] === 'Datum;Typ;Wertpapier;ISIN;Stück;Betrag in EUR;Gebühren in EUR', lines[0]);
    check('Bericht: CSV sortiert, Name mit Semikolon in Anführungszeichen', lines[1] === '2026-01-01;Ausschüttung;"Welt; ""ETF""";IE1;0;10,00;0,00', lines[1]);
    check('Bericht: CSV Kauf mit Dezimalkomma', lines[2] === '2026-02-01;Kauf;"Welt; ""ETF""";IE1;1,5;150,50;1,90', lines[2]);
    const overview: YearsOverview = {
      years: [{ year: 2026, running: true, startValue: 1000, endValue: 1200, bought: 150, sold: 0, dividends: 10, realized: 0, gain: 60, twr: 0.05, benchmarkReturn: 0.04 }],
      total: { open: 50, realized: 0, dividends: 10, gain: 60 },
    };
    const position = {
      instrument: { isin: 'IE1', name: 'Welt <&> ETF', shortName: 'Welt', kind: 'ETF' as const },
      quantity: 10,
      price: 120,
      value: 1200,
      share: 1,
      gain: 200,
      irr: 0.05,
      dividends: 0,
      fees: 2,
      realized: null,
      series: [],
    };
    const html = buildYearReportHtml(data, overview, 'MSCI World', [position], new Date(2026, 10, 16, 12));
    check('Bericht: laufendes Jahr als „bisher“', html.includes('2026 (bisher)'));
    check('Bericht: Vergleichsindex in der Tabelle', html.includes('MSCI World'));
    check('Bericht: Position escaped in der Tabelle', html.includes('Welt &lt;&amp;&gt; ETF'));
    check('Bericht: Erstellt-Datum', html.includes('16.11.2026'));
    check('Bericht: kein NaN oder undefined', !/NaN|undefined/.test(html));
    check('Bericht: Verkäufe ohne Wert als Strich', html.includes('<td>–</td>'));
    check('Bericht: ohne Positionen keine Positions-Tabelle', !buildYearReportHtml(data, overview, null).includes('Positionen heute'));
  }

  // --- Kurshistorie von Yahoo (nachgebaut) ---
  {
    const ts = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 1000;
    const chart = (currency: string, points: [string, number | null][]) => ({
      chart: { result: [{ meta: { currency, gmtoffset: 0 }, timestamp: points.map(([d]) => ts(d)), indicators: { quote: [{ close: points.map(([, p]) => p) }] } }] },
    });
    const search: Record<string, string[]> = { US1: ['AAA'], GB1: ['BBB.L'], IE1: ['X.L', 'X.DE'], BAD1: ['WRONG'], NONE: [] };
    const charts: Record<string, unknown> = {
      AAA: chart('USD', [['2025-01-06', 100], ['2025-06-02', 100], ['2026-11-02', 100]]),
      'BBB.L': chart('GBp', [['2025-01-06', 4000], ['2025-06-02', 4500], ['2026-11-02', 5000]]),
      'X.DE': chart('EUR', [['2025-01-06', 100], ['2026-11-02', null], ['2026-11-03', 110]]),
      WRONG: chart('EUR', [['2026-11-02', 10]]),
      'USDEUR=X': chart('USD', [['2020-01-01', 0.9]]),
      'GBPEUR=X': chart('GBP', [['2020-01-01', 1.2]]),
      [BENCHMARK.symbol]: chart('EUR', [['2025-01-06', 80], ['2025-06-02', 90], ['2026-11-02', 100]]),
    };
    const urls: string[] = [];
    const yahoo = async (url: string, init?: RequestInit) => {
      urls.push(url);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (!headers['User-Agent']) return new Response('', { status: 429 });
      const q = new URL(url);
      if (q.pathname.includes('/search')) return new Response(JSON.stringify({ quotes: (search[q.searchParams.get('q')!] ?? []).map((symbol) => ({ symbol })) }));
      const body = charts[decodeURIComponent(q.pathname.split('/').pop()!)];
      return body ? new Response(JSON.stringify(body)) : new Response('', { status: 404 });
    };

    check('Yahoo: Euro-Börse bevorzugt', (await findSymbol(yahoo, 'IE1')) === 'X.DE');
    const market = await loadMarketData(yahoo, { US1: 92, GB1: 60, IE1: 110, BAD1: 100, NONE: 5 }, BENCHMARK, new Date('2026-11-04T10:00:00Z'));
    check('Yahoo: Dollar in Euro umgerechnet', market.series.US1?.[0].price === 90, String(market.series.US1?.[0].price));
    check('Yahoo: Pence in Euro umgerechnet', Math.abs((market.series.GB1?.at(-1)?.price ?? 0) - 60) < 1e-9);
    check('Yahoo: Lücken übersprungen', market.series.IE1?.length === 2);
    check('Yahoo: falsches Papier verworfen', !market.series.BAD1 && !market.series.NONE);
    check('Yahoo: MSCI World geladen', market.benchmark?.length === 3);
    check('Yahoo: gewählter Index wird gemerkt', market.benchmarkKey === BENCHMARK.key);
    const sp500 = BENCHMARKS.find((b) => b.name === 'S&P 500')!;
    charts[sp500.symbol] = chart('EUR', [['2025-01-06', 50], ['2026-11-02', 70]]);
    const switched = await loadMarketData(yahoo, { US1: 92 }, sp500, new Date('2026-11-04T10:00:00Z'));
    check('Yahoo: anderer Index wird geladen und gemerkt', switched.benchmark?.length === 2 && switched.benchmarkKey === sp500.key);
    check('Yahoo: keine Depotdaten in Anfragen', !urls.some((u) => /92|60|110/.test(new URL(u).search.replace(/quotesCount=10/, ''))));
    check('Yahoo: alle ISINs als abgefragt gemerkt', market.isins.length === 5);
    check('Yahoo: frisch → kein Neuladen', !needsRefresh(market, ['US1'], new Date('2026-11-04T20:00:00Z')));
    check('Yahoo: alt oder neue Position → Neuladen', needsRefresh(market, ['US1'], new Date('2026-11-05T00:00:00Z')) && needsRefresh(market, ['NEU'], new Date('2026-11-04T11:00:00Z')));

    const raw: RawPortfolio = {
      positions: [
        { quantity: { value: '10' }, currentPrice: { price: { value: '92' } }, instrument: { isin: 'US1', name: 'US' } },
        { quantity: { value: '5' }, currentPrice: { price: { value: '60' } }, purchaseValue: { value: '250' }, instrument: { isin: 'GB1', name: 'GB' } },
      ],
      transactions: [{ bookingStatus: 'BOOKED', bookingDate: '2025-06-02', quantity: { value: '10' }, executionPrice: { value: '91' }, transactionValue: { value: '910' }, transactionType: { key: 'BUY' }, instrument: { isin: 'US1' } }],
    };
    const data = mapPortfolio(raw, [], '2026-11-04', '2026-11-04T10:00:00.000Z', market);
    const opening = data.transactions.find((t) => t.isin === 'GB1');
    check('Mit Kurshistorie: Eröffnungskauf zum Marktkurs', opening?.date === '2025-06-02' && Math.abs(opening.amount - 5 * 54) < 1e-9, String(opening?.amount));
    check('comdirect-Kurs hat Vorrang vor Yahoo', data.prices.US1.find((p) => p.date === '2025-06-02')?.price === 91);
    check('Kurse nach dem Abruftag ignoriert', !data.prices.IE1 && data.prices.US1.at(-1)?.date === '2026-11-04');
    check('Einstandswert bleibt für „seit Kauf“', data.costBasis?.GB1 === 250);
    const result = analyzePeriod(data, null);
    check('MSCI-World-Vergleich vorhanden', data.benchmark?.isin === BENCHMARK.key && result.benchmark !== null && result.benchmark.irr !== null);
    check('Depotwert unverändert = comdirect', Math.abs(result.endValue - (920 + 300)) < 1e-6, result.endValue.toFixed(2));
    const without = mapPortfolio(raw, [], '2026-11-04', '2026-11-04T10:00:00.000Z', { series: {}, benchmark: null });
    check('Ohne Yahoo wie bisher', without.benchmark === null && without.transactions.find((t) => t.isin === 'GB1')?.amount === 250);
  }

  // --- Aktuelle Kurse: Bestand vom letzten Abruf mit neueren Kursen bewerten ---
  {
    const unix = (iso: string) => Date.parse(iso) / 1000;
    const meta = (currency: string, price: number, time: string) => ({ currency, gmtoffset: 3600, regularMarketPrice: price, regularMarketTime: unix(time) });
    const metas: Record<string, ReturnType<typeof meta>> = {
      AAA: meta('USD', 110, '2026-11-09T20:00:00Z'),
      'USDEUR=X': meta('EUR', 0.9, '2026-11-09T21:00:00Z'),
      'X.DE': meta('EUR', 200, '2026-11-09T16:30:00Z'), // Sprung > 25 % → verworfen
      [BENCHMARK.symbol]: meta('EUR', 105, '2026-11-09T16:30:00Z'),
    };
    const yahoo = async (url: string) => {
      const q = new URL(url);
      const symbol = decodeURIComponent(q.pathname.split('/').pop()!);
      if (symbol === 'WEEKLY') {
        // Wochenkurse: letzter Punkt ist die laufende Woche (Montag), meta hat den echten Tag
        const ts = ['2026-10-26', '2026-11-02', '2026-11-09'].map((d) => unix(d + 'T00:00:00Z'));
        return new Response(JSON.stringify({ chart: { result: [{ meta: meta('EUR', 103, '2026-11-11T16:30:00Z'), timestamp: ts, indicators: { quote: [{ close: [100, 101, 102] }] } }] } }));
      }
      const m = metas[symbol];
      return m ? new Response(JSON.stringify({ chart: { result: [{ meta: m }] } })) : new Response('', { status: 404 });
    };
    const weekly = await fetchChart(yahoo, 'WEEKLY');
    check('Laufende Woche mit echtem Datum', weekly.points.map((p) => `${p.date}:${p.price}`).join() === '2026-10-26:100,2026-11-02:101,2026-11-11:103', weekly.points.map((p) => p.date).join());

    const base = {
      fetchedAt: '2026-11-07T10:00:00.000Z',
      isins: ['US1', 'IE1'],
      series: { US1: [{ date: '2026-11-02', price: 90 }], IE1: [{ date: '2026-11-02', price: 110 }] },
      benchmark: [{ date: '2025-06-02', price: 90 }, { date: '2026-11-02', price: 100 }],
      symbols: { US1: 'AAA', IE1: 'X.DE' },
    };
    const market = await loadQuotes(yahoo, base, new Date('2026-11-09T21:05:00Z'));
    check('Kurs in Euro umgerechnet', Math.abs((market.quotes?.US1?.price ?? 0) - 99) < 1e-9 && market.quotes?.US1?.date === '2026-11-09');
    check('Unplausibler Kurssprung verworfen', !market.quotes?.IE1);
    check('Benchmark-Kurs geladen', market.benchmarkQuote?.price === 105);
    check('Kurse nach 15 Minuten veraltet', !quotesStale(market, new Date('2026-11-09T21:15:00Z')) && quotesStale(market, new Date('2026-11-09T21:25:00Z')));

    const raw: RawPortfolio = {
      positions: [{ quantity: { value: '10' }, currentPrice: { price: { value: '92' } }, purchaseValue: { value: '800' }, instrument: { isin: 'US1' } }],
      transactions: [{ bookingStatus: 'BOOKED', bookingDate: '2025-06-02', quantity: { value: '10' }, executionPrice: { value: '80' }, transactionValue: { value: '800' }, transactionType: { key: 'BUY' }, instrument: { isin: 'US1' } }],
    };
    const est = mapPortfolio(raw, [], '2026-11-07', '2026-11-07T10:00:00.000Z', market);
    check('Schätzung: Stichtag = neuester Kurs', est.asOf === '2026-11-09' && est.source.kind === 'comdirect' && est.source.pricedAt === '2026-11-09T20:00:00.000Z');
    const estResult = analyzePeriod(est, null);
    check('Schätzung: alter Bestand × neuer Kurs', Math.abs(estResult.endValue - 990) < 1e-9, estResult.endValue.toFixed(2));
    check('Schätzung: Abrufkurs bleibt im Verlauf', est.prices.US1.some((p) => p.date === '2026-11-07' && p.price === 92));
    check('Schätzung: Benchmark bis zum neuen Stichtag', est.prices[BENCHMARK.key].at(-1)?.date === '2026-11-09' && estResult.benchmark !== null);

    // Kurs älter als der Abruf → kein Ersatz, Stand bleibt der Abruf
    const old = mapPortfolio(raw, [], '2026-11-09', '2026-11-09T21:00:00.000Z', market);
    check('Älterer Kurs ersetzt den Abruf nicht', old.asOf === '2026-11-09' && old.source.kind === 'comdirect' && !old.source.pricedAt && analyzePeriod(old, null).endValue === 920);
  }

  // --- Top-Bewegungen: Tagesbewegung der größten Firmen (Yahoo nachgebaut) ---
  {
    const unix = (iso: string) => Date.parse(iso) / 1000;
    // Fünf Handelstage (Mo 16. – Fr 20.); der letzte Schluss ist der aktuelle Kurs, chartPreviousClose die Wochenbasis
    const day = (price: number, closes: (number | null)[], weekBase: number) => ({
      chart: {
        result: [
          {
            meta: { regularMarketPrice: price, chartPreviousClose: weekBase, regularMarketTime: unix('2026-11-20T20:00:00Z'), gmtoffset: -18000 },
            timestamp: [16, 17, 18, 19, 20].map((d) => unix(`2026-11-${d}T14:30:00Z`)),
            indicators: { quote: [{ close: closes }] },
          },
        ],
      },
    });
    const searches: Record<string, unknown[]> = {
      'NVIDIA': [
        { quoteType: 'ETF', symbol: 'FALSCH', longname: 'NVIDIA ETF' }, // kein EQUITY
        { quoteType: 'EQUITY', symbol: 'NVDA', longname: 'NVIDIA Corporation' },
      ],
      'SAP': [{ quoteType: 'EQUITY', symbol: 'SAP-FALSCH', longname: 'Saputo Inc' }], // anderes erstes Wort
      'Kaputt AG': [{ quoteType: 'EQUITY', symbol: 'TOT', longname: 'Kaputt AG' }],
      'Zappelig SE': [{ quoteType: 'EQUITY', symbol: 'ZAP', longname: 'Zappelig SE' }],
    };
    // NVDA: Vortag 100 (die Lücke am Dienstag wird übersprungen), Wochenbasis 90; ZAP: +100 % am Tag → unplausibel
    const days: Record<string, unknown> = { NVDA: day(95, [91, null, 93, 100, 95], 90), ZAP: day(200, [100, 100, 100, 100, 200], 95) };
    const urls: string[] = [];
    const yahoo = async (url: string) => {
      urls.push(url);
      const q = new URL(url);
      if (q.pathname.includes('/search')) return new Response(JSON.stringify({ quotes: searches[q.searchParams.get('q')!] ?? [] }));
      const body = days[decodeURIComponent(q.pathname.split('/').pop()!)];
      return body ? new Response(JSON.stringify(body)) : new Response('', { status: 404 });
    };

    const companies = [
      { key: 'NVIDIA', label: 'NVIDIA' },
      { key: 'SAP', label: 'SAP' },
      { key: 'KAPUTT', label: 'Kaputt AG' },
      { key: 'ZAPPELIG', label: 'Zappelig SE' },
    ];
    const now = new Date('2026-11-20T21:00:00Z');
    const cache = await loadMovers(yahoo, companies, null, now);
    check('Bewegungen: Tagesbewegung berechnet', Math.abs((cache?.quotes.NVIDIA?.change ?? 0) - -0.05) < 1e-9 && cache?.quotes.NVIDIA?.date === '2026-11-20');
    check('Bewegungen: Wochenbewegung aus derselben Antwort', Math.abs((cache?.quotes.NVIDIA?.weekChange ?? 0) - (95 / 90 - 1)) < 1e-9);
    check('Bewegungen: falsches erstes Wort nicht übernommen', cache?.symbols.SAP === null);
    check('Bewegungen: toter Kurs blockiert die anderen nicht', cache?.symbols.KAPUTT === 'TOT' && !cache?.quotes.KAPUTT && cache?.quotes.NVIDIA !== undefined);
    check('Bewegungen: unplausibler Sprung verworfen', !cache?.quotes.ZAPPELIG);
    check('Bewegungen: frisch → kein Neuladen', (await loadMovers(yahoo, companies, cache!, new Date('2026-11-20T21:10:00Z'))) === null && !moversStale(cache, new Date('2026-11-20T21:10:00Z')));
    const before = urls.filter((u) => u.includes('/search')).length;
    const again = await loadMovers(yahoo, companies, cache!, new Date('2026-11-20T21:20:00Z'));
    const sameDay = urls.filter((u) => u.includes('/search')).length;
    check('Bewegungen: Kürzel bleiben gemerkt, keine neue Suche am selben Tag', again !== null && sameDay === before);
    await loadMovers(yahoo, companies, again!, new Date('2026-11-21T09:00:00Z'));
    check('Bewegungen: erfolglose Suche am nächsten Tag wiederholt', urls.filter((u) => u.includes('/search')).length > sameDay);
    const offline = async (): Promise<Response> => {
      throw new Error('offline');
    };
    check('Bewegungen: offline → alter Stand bleibt', (await loadMovers(offline, companies, cache!, new Date('2026-11-21T09:00:00Z'))) === null);
    const countBefore = urls.length;
    await loadMovers(yahoo, Array.from({ length: 15 }, (_, i) => ({ key: `F${i}`, label: `Firma ${i}` })), null, new Date('2026-11-22T10:00:00Z'));
    // Je unbekannter Firma zwei Suchversuche (Anzeigename, bereinigter Name), aber nur für die ersten zehn
    check('Bewegungen: höchstens zehn Firmen abgefragt', urls.length - countBefore === 20 && MAX_MOVERS === 10, String(urls.length - countBefore));
  }

  // --- CSV-Import der Depotumsätze (Format wie im Export von comdirect.de, Zahlen erfunden) ---
  {
    const csvText = [
      ';',
      '"Umsätze Depot";"Zeitraum: 09.11.2024 - 09.11.2026";',
      '',
      '"Buchungstag";"Geschäftstag";"Stück / Nom.";"Bezeichnung";"WKN";"Währung";"Ausführungskurs";"Umsatz in EUR";',
      '"03.11.2026";"02.11.2026";"0,386";"ISHSIII-CORE MSCI WLD DLA";"A0RPWH";"EUR";"129,36";"50,00";',
      '"02.06.2025";"30.05.2025";"10";"ISHSIII-CORE MSCI WLD DLA";"A0RPWH";"EUR";"100,00";"1.000,00";',
      '"02.06.2025";"30.05.2025";"10";"ISHSIII-CORE MSCI WLD DLA";"A0RPWH";"EUR";"100,00";"1.000,00";',
      '"15.01.2025";"13.01.2025";"-5";"ALLIANZ SE NA O.N.";"840400";"EUR";"250,00";"1.250,00";',
      '"10.12.2024";"06.12.2024";"2";"APPLE INC.";"865985";"USD";"230,00";"440,50";',
      '"11.12.2024";"09.12.2024";"x";"KAPUTT";"000000";"EUR";"1,00";"1,00";',
    ].join('\r\n');
    // Wie comdirect: Windows-1252 (ä = 0xE4)
    const bytes = Uint8Array.from([...csvText].map((c) => c.charCodeAt(0)));
    check('CSV: Windows-1252 erkannt', decodeCsv(bytes).includes('Geschäftstag'));
    check('CSV: UTF-8 erkannt', decodeCsv(new TextEncoder().encode(csvText)).includes('Ausführungskurs'));
    check('CSV: deutsche Zahlen', germanNumber('1.234,56') === 1234.56 && germanNumber('-0,386') === -0.386);
    check('CSV: Punkt als Dezimal- oder Tausenderzeichen', germanNumber('-12.50') === -12.5 && germanNumber('1.000') === 1000 && germanNumber('-1.250.000') === -1250000);

    const csv = parseDepotCsv(decodeCsv(bytes));
    check('CSV: Käufe und Verkäufe gezählt', csv.buys === 4 && csv.sells === 1, `${csv.buys}/${csv.sells}`);
    check('CSV: Zeitraum', csv.from === '2024-12-10' && csv.to === '2026-11-03');
    check('CSV: kaputte Zeile übersprungen', csv.skipped === 1);
    const first = csv.transactions[0];
    check('CSV: Felder übernommen', first.bookingDate === '2026-11-03' && first.businessDate === '2026-11-02' && first.quantity?.value === '0.386' && first.transactionValue?.value === '50' && first.executionPrice?.value === '129.36' && first.instrument?.wkn === 'A0RPWH');
    check('CSV: gleiche Zeilen bleiben zwei Umsätze', new Set(csv.transactions.map((t) => t.transactionId)).size === csv.transactions.length);
    check('CSV: Fremdwährungskurs nicht als Euro-Kurs', csv.transactions.find((t) => t.instrument?.wkn === '865985')?.executionPrice === undefined);
    let wrongFile = false;
    try {
      parseDepotCsv('"Buchungstag";"Wertstellung";"Vorgang";"Buchungstext";"Umsatz in EUR";'.replace('Umsatz in EUR', 'Betrag'));
    } catch {
      wrongFile = true;
    }
    check('CSV: falsche Datei (Kontoumsätze) abgelehnt', wrongFile);

    // Zusammenführen mit Umsätzen der Schnittstelle (die kennt ISIN und WKN)
    const world = { isin: 'IE00B4L5Y983', wkn: 'A0RPWH', name: 'iShares Core MSCI World', shortName: 'MSCI World', staticData: { instrumentType: 'ETF' } };
    const stored = {
      fetchedAt: '2026-11-07T10:00:00.000Z',
      snapshots: [],
      raw: {
        positions: [{ quantity: { value: '20.386' }, currentPrice: { price: { value: '130' } }, instrument: world }],
        transactions: [{ transactionId: 'T1', bookingStatus: 'BOOKED', bookingDate: '2026-11-03', businessDate: '2026-11-02', quantity: { value: '0.386' }, executionPrice: { value: '129.36' }, transactionValue: { value: '49.93' }, transactionType: { key: 'BUY' }, instrument: world }],
      } as RawPortfolio,
    };
    const { stored: merged, added } = addCsvTransactions(stored, csv.transactions);
    check('CSV: schon über die Schnittstelle bekannter Umsatz nicht doppelt', added === 4 && merged.raw.transactions.length === 5, String(added));
    check('CSV: erneuter Import ändert nichts', addCsvTransactions(merged, csv.transactions).added === 0);

    const data = mapPortfolio(merged.raw, [], '2026-11-07', merged.fetchedAt);
    const worldTx = data.transactions.filter((t) => t.isin === world.isin);
    check('CSV: WKN der ISIN zugeordnet', worldTx.length === 3 && !data.transactions.some((t) => t.isin === 'A0RPWH'));
    check('CSV: Name aus der Schnittstelle', data.instruments.find((i) => i.isin === world.isin)?.shortName === 'MSCI World');
    check('CSV: kein Eröffnungskauf nötig', worldTx.every((t) => t.date !== '2024-12-10' || t.isin !== world.isin) && Math.abs(worldTx.reduce((q, t) => q + t.quantity, 0) - 20.386) < 1e-9);
    check('CSV: früheste Umsätze reichen weiter zurück', data.transactions[0].date === '2024-12-10');
    const allianz = data.transactions.filter((t) => t.isin === '840400');
    check('CSV: verkauftes Papier ohne Kauf → Eröffnungskauf', allianz.length === 2 && allianz[0].type === 'buy' && allianz[0].quantity === 5 && allianz[0].date === '2024-12-10');
    const apple = data.transactions.filter((t) => t.isin === '865985');
    check('CSV: nicht mehr gehaltenes Papier ausgebucht', apple.length === 2 && apple[1].type === 'sell' && apple[1].quantity === 2);
    const chart = buildSeries(data, null);
    const saleDay = chart.find((p) => p.date === '2025-01-15');
    check('Chart: Verkauf mit Erlös markiert', saleDay?.sold === 1250 && chart.filter((p) => p.sold > 0).length === 2, chart.filter((p) => p.sold > 0).map((p) => p.date).join());
    check('Chart: Käufe nicht als Verkauf markiert', chart.find((p) => p.date === '2025-06-02')?.sold === 0);
    check('CSV: Depotwert = heutiger Bestand', Math.abs(analyzePeriod(data, null).endValue - 20.386 * 130) < 1e-6);

    // Späterer Abruf liefert einen Umsatz, der schon per CSV da ist → die Schnittstelle gewinnt
    const later = { ...stored.raw.transactions[0], transactionId: 'T0', bookingDate: '2025-06-02', businessDate: '2025-05-30', quantity: { value: '10' }, transactionValue: { value: '1000' } };
    const afterFetch = mergeTransactions(merged.raw.transactions, [later]);
    const june = afterFetch.filter((t) => t.bookingDate === '2025-06-02');
    check('CSV: späterer Abruf ersetzt den CSV-Umsatz', june.length === 1 && june[0].transactionId === 'T0', String(june.length));
  }

  // --- Sperre „nur lesen“: nicht erlaubte Aufrufe erreichen das Netzwerk nie ---
  {
    let sent = 0;
    const api = new ComdirectApi(async () => {
      sent++;
      return new Response('{}', { status: 200 });
    });
    const send = (url: string, init: RequestInit) => (api as unknown as { send: (u: string, i: RequestInit) => Promise<Response> }).send(url, init);
    const blocked = async (name: string, run: () => Promise<unknown>) => {
      const before = sent;
      let error = '';
      try {
        await run();
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      check(`Gesperrt: ${name}`, sent === before && error.startsWith('Gesperrt'), error);
    };
    const H = 'https://api.comdirect.de';
    await blocked('Order anlegen', () => send(`${H}/api/brokerage/v3/orders`, { method: 'POST', body: '{}' }));
    await blocked('Order-Validierung', () => send(`${H}/api/brokerage/v3/orders/validation`, { method: 'POST', body: '{}' }));
    await blocked('Order ändern', () => send(`${H}/api/brokerage/v3/orders/123`, { method: 'PATCH', body: '{}' }));
    await blocked('Order löschen', () => send(`${H}/api/brokerage/v3/orders/123`, { method: 'DELETE' }));
    await blocked('Orderbuch lesen (nicht nötig)', () => api.get('t', '/brokerage/depots/D1/v3/orders'));
    await blocked('Überweisung', () => send(`${H}/api/banking/v2/accounts/A1/transactions`, { method: 'POST', body: '{}' }));
    await blocked('Konten lesen (nicht nötig)', () => api.get('t', '/banking/clients/user/v2/accounts/balances'));
    await blocked('Pfad mit ..', () => api.get('t', '/brokerage/v3/depots/../orders/transactions'));
    await blocked('Positionen per POST', () => send(`${H}/api/brokerage/v3/depots/D1/positions`, { method: 'POST' }));
    await blocked('fremder Server', () => send('https://evil.example/api/brokerage/clients/user/v3/depots', { method: 'GET' }));
    await blocked('unverschlüsselt (http)', () => send('http://api.comdirect.de/api/brokerage/clients/user/v3/depots', { method: 'GET' }));
    await blocked('ähnlicher Hostname', () => send('https://api.comdirect.de.evil.example/oauth/token', { method: 'POST', body: 'grant_type=password' }));
    await blocked('Token-Art refresh_token', () => send(`${H}/oauth/token`, { method: 'POST', body: 'grant_type=refresh_token&refresh_token=x' }));
    await blocked('Session-PATCH mit Parametern', () => send(`${H}/api/session/clients/user/v1/sessions/S1?x=1`, { method: 'PATCH', body: '{}' }));

    // Erlaubtes geht durch
    const allowed = (url: string, init: RequestInit) => {
      try {
        assertAllowed(url, init);
        return true;
      } catch {
        return false;
      }
    };
    check(
      'Erlaubt: alle Schritte von Anmeldung und Abruf',
      [
        allowed(`${H}/oauth/token`, { method: 'POST', body: 'client_id=a&grant_type=password' }),
        allowed(`${H}/oauth/token`, { method: 'POST', body: 'grant_type=cd_secondary&token=x' }),
        allowed(`${H}/api/session/clients/user/v1/sessions`, { method: 'GET' }),
        allowed(`${H}/api/session/clients/user/v1/sessions/ABC-123/validate`, { method: 'POST', body: '{}' }),
        allowed(`${H}/api/session/clients/user/v1/sessions/ABC-123`, { method: 'PATCH', body: '{}' }),
        allowed(`${H}/api/session/v1/authentications/CH1`, { method: 'GET' }),
        allowed(`${H}/api/brokerage/clients/user/v3/depots`, { method: 'GET' }),
        allowed(`${H}/api/brokerage/v3/depots/D1/positions?with-attr=instrument`, { method: 'GET' }),
        allowed(`${H}/api/brokerage/v3/depots/D1/transactions?paging-first=0&paging-count=500`, { method: 'GET' }),
        allowed(`${H}/oauth/revoke`, { method: 'DELETE' }),
      ].every(Boolean),
    );
  }

  // --- Erinnerung an die Sicherung ---
  {
    const now = new Date('2026-11-09T20:00:00Z');
    check('Sicherung: nie gesichert → erinnern', backupDue(null, now));
    check('Sicherung: vor 2 Wochen → nicht erinnern', !backupDue('2026-10-26T20:00:00Z', now));
    check('Sicherung: vor 5 Wochen → erinnern', backupDue('2026-10-05T20:00:00Z', now));
  }

  // --- Ausschüttungen aus den Kontoumsätzen (Format wie im Export von comdirect.de, Zahlen erfunden) ---
  {
    const stoxx = { isin: 'DE0002635307', wkn: '263530', name: 'iShares STOXX Europe 600', shortName: 'STOXX Europe 600', staticData: { instrumentType: 'ETF' } };
    const stored = {
      fetchedAt: '2026-11-07T10:00:00.000Z',
      snapshots: [],
      raw: {
        positions: [{ quantity: { value: '50' }, currentPrice: { price: { value: '55' } }, purchaseValue: { value: '2500' }, instrument: stoxx }],
        transactions: [{ transactionId: 'T1', bookingStatus: 'BOOKED', bookingDate: '2025-03-03', quantity: { value: '50' }, executionPrice: { value: '50' }, transactionValue: { value: '2500' }, transactionType: { key: 'BUY' }, instrument: stoxx }],
      } as RawPortfolio,
    };
    const accountCsv = [
      ';',
      '"Umsätze Verrechnungskonto";"Zeitraum: 09.11.2024 - 09.11.2026";',
      '',
      '"Buchungstag";"Wertstellung (Valuta)";"Vorgang";"Buchungstext";"Umsatz in EUR";',
      '"offen";"16.11.2026";"Lastschrift / Belastung";" Buchungstext: XXX";"-12,00";',
      '"15.09.2026";"15.09.2026";"Kupon";" Buchungstext: ERTRAEGNISGUTSCHRIFT VOM 15.09.26 DEPOTBESTAND: 50,000 ISH.STOX.EUROPE 600 U.ETF 263530 EUR 0,0700000 Abr.Betrag Brutto 3,50 EUR Steuerabzug 0,21- EUR Ref. XXX";"3,29";',
      '"16.06.2026";"16.06.2026";"Kupon";" Buchungstext: ERTRAEGNISGUTSCHRIFT VOM 16.06.26 DEPOTBESTAND: 50,000 ISH.STOX.EUROPE 600 U.ETF 263530 EUR 0,1200000 Abr.Betrag Brutto 6,00 EUR Steuerabzug 0,36- EUR Ref. XXX";"5,64";',
      '"02.06.2026";"02.06.2026";"Übertrag / Überweisung";" Buchungstext: XXX Sparplan";"-100,00";',
      '"20.05.2026";"20.05.2026";"Kupon";" Buchungstext: ERTRAEGNISGUTSCHRIFT VOM 20.05.26 DEPOTBESTAND: 3,000 UNBEKANNT FONDS A1B2C3 EUR 0,5 Ref. XXX";"1,40";',
      '"10.05.2026";"10.05.2026";"Kupon";" Buchungstext: ERTRAEGNISGUTSCHRIFT OHNE ANGABEN Ref. XXX";"2,00";',
      '"20.01.2026";"20.01.2026";"Wertpapiere";" Buchungstext: Steuerbelastung auf Vorabpauschale gem. § 18 InvStG Depotbestand: 50,00 ISH.STOX.EUROPE 600 U.ETF 263530 EUR 0,85 weitere Informationen unter: www.comdirect.de/vorabpauschale Ref. XXX";"-1,25";',
      '"21.01.2025";"21.01.2025";"Wertpapiere";" Buchungstext: Steuerbelastung auf Vorabpauschale gem. § 18 InvStG Depotbestand: 40,00 ISH.STOX.EUROPE 600 U.ETF 263530 EUR 0,70 weitere Informationen unter: www.comdirect.de/vorabpauschale Ref. XXX";"-0,80";',
    ].join('\r\n');
    const known = knownInstrumentIds(stored);
    const result = parseComdirectCsv(decodeCsv(Uint8Array.from([...accountCsv].map((c) => c.charCodeAt(0)))), known);
    check('Konto-CSV erkannt', result.kind === 'account');
    if (result.kind === 'account') {
      check('Konto-CSV: nur Ausschüttungen und Vorabpauschale, keine Überweisungen/Lastschriften', result.dividends === 3 && result.prepaidTaxes === 2 && result.transactions.length === 5, `${result.dividends}/${result.prepaidTaxes}`);
      check('Vorabpauschale: Summe', Math.abs(result.prepaidTaxTotal - 2.05) < 1e-9, String(result.prepaidTaxTotal));
      check('Konto-CSV: Betrag netto', Math.abs(result.total - (3.29 + 5.64 + 1.4)) < 1e-9 && result.transactions[0].transactionValue?.value === '3.29');
      check('Konto-CSV: ohne WKN nicht zuordenbar', result.unassigned === 1);
      check('Konto-CSV: Zeitraum', result.from === '2025-01-21' && result.to === '2026-09-15');
      const { stored: merged, added } = addCsvTransactions(stored, result.transactions);
      check('Konto-CSV: übernommen', added === 5);
      check('Konto-CSV: erneuter Import ändert nichts', addCsvTransactions(merged, result.transactions).added === 0);
      const data = mapPortfolio(merged.raw, [], '2026-11-07', merged.fetchedAt);
      const divs = data.transactions.filter((t) => t.type === 'dividend');
      check('Ausschüttungen dem Papier zugeordnet (WKN → ISIN)', divs.length === 2 && divs.every((d) => d.isin === stoxx.isin && d.quantity === 0), divs.map((d) => d.isin).join());
      check('Unbekanntes Papier ohne Kurse fällt raus', !data.transactions.some((t) => t.isin === 'A1B2C3'));
      const withDiv = analyzePeriod(data, null);
      const without = analyzePeriod(mapPortfolio(stored.raw, [], '2026-11-07', stored.fetchedAt), null);
      check('Ausschüttungen erhöhen den Gewinn', Math.abs(withDiv.gain - without.gain - (3.29 + 5.64)) < 1e-9, `${without.gain} → ${withDiv.gain}`);
      check('Ausschüttungen erhöhen die Rendite', (withDiv.irr ?? 0) > (without.irr ?? 0));
      check('Depotwert unverändert', Math.abs(withDiv.endValue - without.endValue) < 1e-9);
      check('Bestand unverändert (kein Eröffnungskauf)', data.transactions.filter((t) => t.type === 'buy').length === 1);
      check('Vorabpauschale je Position, nicht in der Rendite', Math.abs((data.prepaidTax?.[stoxx.isin] ?? 0) - 2.05) < 1e-9 && !data.transactions.some((t) => t.date === '2026-01-20'));
      const pos = analyzePositions(data)[0];
      check('Position zeigt Ausschüttungen', Math.abs(pos.dividends - (3.29 + 5.64)) < 1e-9);
    }
    check('Depot-CSV weiter erkannt', parseComdirectCsv('"Buchungstag";"Geschäftstag";"Stück / Nom.";"Bezeichnung";"WKN";"Währung";"Ausführungskurs";"Umsatz in EUR";', new Set()).kind === 'depot');
    check('WKN: Wort im Namen ist keine WKN', instrumentFromText('DEPOTBESTAND: 1,0 ISH STOXX EUROPE EUR 0,5', new Set()) === null);
    check('WKN: bekannte WKN wird gefunden', instrumentFromText('ERTRAG 840400 ALLIANZ', new Set(['840400'])) === '840400');
  }

  // --- Seit dem letzten Besuch: nur Kursbewegung, keine Einzahlungen ---
  {
    const etf = { isin: 'IE00B4L5Y983', wkn: 'A0RPWH', name: 'World', shortName: 'World' };
    const raw = (qty: string, price: string, txs: RawPortfolio['transactions']): RawPortfolio => ({
      positions: [{ quantity: { value: qty }, currentPrice: { price: { value: price } }, instrument: etf }],
      transactions: txs,
    });
    const buy = (date: string, q: string, v: string) => ({ bookingStatus: 'BOOKED', bookingDate: date, quantity: { value: q }, transactionValue: { value: v }, executionPrice: { value: String(Number(v) / Number(q)) }, transactionType: { key: 'BUY' }, instrument: etf });
    const before = mapPortfolio(raw('10', '100', [buy('2026-01-05', '10', '1000')]), [], '2026-11-06', '2026-11-06T17:00:00.000Z');
    const snap = takeSnapshot(before, new Date('2026-11-06T21:00:00Z'))!;
    check('Besuch: Snapshot mit Bestand und Kurs', snap.holdings[etf.isin] === 10 && snap.prices[etf.isin] === 100);
    check('Besuch: keine neuen Kurse → nichts anzeigen', visitChange(snap, before) === null);

    // Neuer Abruf: Kurs 103, dazu ein Sparplan-Kauf über 5 Stück (515 €)
    const after = mapPortfolio(raw('15', '103', [buy('2026-01-05', '10', '1000'), buy('2026-11-09', '5', '515')]), [], '2026-11-09', '2026-11-09T17:00:00.000Z');
    const c = visitChange(snap, after)!;
    check('Besuch: nur Kursbewegung der alten Anteile', Math.abs(c.amount - 30) < 1e-9 && Math.abs(c.rel - 0.03) < 1e-9, `${c?.amount}`);
    check('Besuch: Sparplan zählt nicht als Gewinn', c.amount < 100);
    check('Besuch: API-Stand ist keine Schätzung', c.estimate === false && c.since === '2026-11-06T21:00:00.000Z');

    // Verkauf dazwischen: Depot halbiert, Kurs fällt leicht → nur der Kursverlust
    const sold = mapPortfolio(raw('5', '99', [buy('2026-01-05', '10', '1000'), { ...buy('2026-11-08', '5', '500'), transactionType: { key: 'SELL' } }]), [], '2026-11-09', '2026-11-09T17:00:00.000Z');
    const s2 = visitChange(snap, sold)!;
    check('Besuch: Verkauf zählt nicht als Verlust', Math.abs(s2.amount - -10) < 1e-9, `${s2?.amount}`);

    // Mit Yahoo-Kurs geschätzt
    const est = mapPortfolio(raw('10', '100', [buy('2026-01-05', '10', '1000')]), [], '2026-11-06', '2026-11-06T17:00:00.000Z', {
      series: {},
      benchmark: null,
      quotes: { [etf.isin]: { date: '2026-11-09', time: '2026-11-09T16:30:00.000Z', price: 98 } },
      benchmarkQuote: null,
    });
    const e = visitChange(snap, est)!;
    check('Besuch: Schätzung mit Yahoo-Kurs gekennzeichnet', e.estimate && Math.abs(e.amount - -20) < 1e-9);
    check('Besuch: Demo-Daten ohne Vergleich', takeSnapshot({ ...before, source: { kind: 'demo' } }) === null);
  }

  check('Kennnummern: WKN wird aus den Bankdaten übernommen', mapPortfolio({ positions: [{ quantity: { value: '1' }, currentPrice: { price: { value: '10' } }, instrument: { isin: 'IE00TEST0001', wkn: 'A0TEST', name: 'Test ETF' } }], transactions: [] } as any, [], '2026-11-11', '2026-11-11T10:00:00.000Z').instruments[0].wkn === 'A0TEST');

  // --- Bestandslisten der ETFs (Format wie der Download von ishares.com, gekürzt) ---
  {
    const ishares = [
      'Fondsposition per,"09.Nov.2026"',
      '',
      'Emittententicker,Name,Sektor,Anlageklasse,Marktwert,Gewichtung (%),Nominalwert,Nominale,Kurs,Standort,Börse,Marktwährung',
      '"AAPL","APPLE","IT","Aktien","8.636.053.364,10","50,00","8.636.053.364,10","24.625.890,00","350,69","Vereinigte Staaten","NASDAQ","USD"',
      '"GOOGL","ALPHABET CLASS A","Kommunikation","Aktien","2.834.790.596,85","20,00","1","1","288,15","Vereinigte Staaten","NASDAQ","USD"',
      '"GOOG","ALPHABET CLASS C","Kommunikation","Aktien","2.834.790.596,85","10,00","1","1","288,15","Vereinigte Staaten","NASDAQ","USD"',
      '"SAP","SAP, SE","IT","Aktien","1","15,00","1","1","200,00","Deutschland","Xetra","EUR"',
      '"EUR","EUR CASH","Barmittel & Derivate","Geldmarkt","1","5,00","1","1","1,00","-","-","EUR"',
      '"ESZ6","S&P500 EMINI DEC 26","Barmittel & Derivate","Futures","0,00","0,00","1","1","7.574,25","-","-","USD"',
      '',
    ].join('\n');
    check('Liste: Zeile mit Komma im Feld', splitCsvLine('"SAP","SAP, SE","5,74"', ',').join('|') === 'SAP|SAP, SE|5,74');
    check('Liste: Zahlen deutsch und englisch', flexibleNumber('5,74') === 5.74 && flexibleNumber('5.74%') === 5.74 && flexibleNumber('1.234,5') === 1234.5 && flexibleNumber('1,234.5') === 1234.5 && isNaN(flexibleNumber('-')));
    const fund = parseHoldings(ishares, '2026-11-11T10:00:00Z');
    check('Liste: Stand erkannt', fund.asOf === '09.Nov.2026', String(fund.asOf));
    check('Liste: Positionen ohne Gewicht übersprungen', fund.count === 5, String(fund.count));
    check('Liste: Branchen summiert', Math.abs(fund.sectors.IT - 0.65) < 1e-9 && Math.abs(fund.sectors.Kommunikation - 0.3) < 1e-9 && Math.abs(fund.sectors[CASH] - 0.05) < 1e-9);
    check('Liste: Länder summiert', Math.abs(fund.countries['Vereinigte Staaten'] - 0.8) < 1e-9 && Math.abs(fund.countries.Deutschland - 0.15) < 1e-9 && Math.abs(fund.countries[OTHER] - 0.05) < 1e-9);
    check('Liste: größte zuerst, Barmittel nicht als Firma', fund.top[0].name === 'APPLE' && fund.top.length === 4);

    // Englisch, Semikolon, Gewicht als Dezimalpunkt: zählt mit der deutschen Liste zusammen
    const english = ['Holdings as of 2026-11-09', 'Name;Weight (%);Sector;Location', 'Apple Inc;40.0;Information Technology;United States', 'Toyota Motor Corp;60.0;Consumer Discretionary;Japan'].join('\r\n');
    const other = parseHoldings(english, 'x');
    check('Liste: englische Liste auf deutsche Bezeichnungen abgebildet', Math.abs(other.sectors.IT - 0.4) < 1e-9 && Math.abs(other.countries['Vereinigte Staaten'] - 0.4) < 1e-9 && other.countries.Japan > 0 && other.asOf === '2026-11-09');
    const fails = (text: string) => {
      try {
        parseHoldings(text, 'x');
        return false;
      } catch {
        return true;
      }
    };
    check('Liste: fremde Datei abgelehnt', fails('Buchungstag;Vorgang;Umsatz in EUR\n01.01.2026;Kupon;12,00') && fails('PK\u0003\u0004irgendwas') && fails('Name,Weight\nApple,5'));

    check('Firmen: Schreibweisen zusammengeführt', companyKey('ALPHABET CLASS A') === companyKey('Alphabet Inc Class C') && companyKey('APPLE') === companyKey('Apple Inc.'));
    check('Firmen: Anzeige', displayName('AMAZON.COM INC') === 'Amazon.com Inc' && displayName('Apple Inc') === 'Apple Inc');

    const pos = (isin: string, name: string, kind: 'ETF' | 'Aktie', share: number) => ({ instrument: { isin, name, shortName: name, kind }, share }) as any;
    const positions = [pos('W', 'World ETF', 'ETF', 0.5), pos('O', 'Other ETF', 'ETF', 0.3), pos('A', 'Apple Inc.', 'Aktie', 0.1), pos('X', 'Unbekannt AG', 'Aktie', 0.1)];
    const all = analyzeComposition(positions, { W: fund, O: other });
    // Apple: 50 % × 0,5 + 40 % × 0,3 + Einzelaktie 0,1 = 0,47
    const apple = all.companies[0];
    check('Depot: Apple über ETFs und Einzelaktie addiert', apple.label === 'Apple' && Math.abs(apple.weight - 0.47) < 1e-9 && apple.sources === 3, `${apple.label} ${apple.weight} ${apple.sources}`);
    const alphabet = all.companies.find((c) => c.label === 'Alphabet');
    check('Depot: Alphabet A und C zusammen', !!alphabet && Math.abs(alphabet.weight - 0.15) < 1e-9 && alphabet.sources === 1);
    check('Depot: Einzelaktie übernimmt Land und Branche aus dem ETF', Math.abs(all.covered - 0.9) < 1e-9 && all.missing.length === 1 && all.missing[0].instrument.isin === 'X');
    // USA: 0,8 × 0,5 + 0,4 × 0,3 + 0,1 = 0,62
    check('Depot: Länder über das Depot gewichtet', all.countries[0].label === 'Vereinigte Staaten' && Math.abs(all.countries[0].weight - 0.62) < 1e-9, String(all.countries[0].weight));
    check('Depot: Summe der Länder = ausgewerteter Anteil', Math.abs(all.countries.reduce((s, c) => s + c.weight, 0) - all.covered) < 1e-9 && Math.abs(all.sectors.reduce((s, c) => s + c.weight, 0) - all.covered) < 1e-9);
    check('Depot: unbekannte Einzelaktie als eigene Firma', all.companies.some((c) => c.label === 'Unbekannt AG' && c.country === UNKNOWN));
    const none = analyzeComposition(positions, {});
    check('Depot: ohne Listen nichts ausgewertet', none.covered === 0 && none.countries.length === 0 && none.missing.length === 4);
  }

  // --- Zuordnung von Bestandslisten zu ETFs ---
  {
    const list = (count: number, countries: Record<string, number>, sectors: Record<string, number> = { IT: 0.25, Finanzwesen: 0.2, Industrie: 0.15 }) =>
      ({ importedAt: 'x', asOf: null, count, countries, sectors, top: [{ name: 'APPLE', weight: 0.05, sector: 'IT', country: 'Vereinigte Staaten' }] }) as any;
    const world = list(1215, { 'Vereinigte Staaten': 0.72, Japan: 0.055, 'Vereinigtes Königreich': 0.035, Deutschland: 0.02 });
    const em = list(3100, { China: 0.27, Taiwan: 0.2, Indien: 0.17, Südkorea: 0.12, Brasilien: 0.04, 'Saudi-Arabien': 0.03 });
    const europe = list(600, { 'Vereinigtes Königreich': 0.23, Frankreich: 0.17, Schweiz: 0.15, Deutschland: 0.15, Niederlande: 0.08, Schweden: 0.06, Spanien: 0.05, Italien: 0.05, Dänemark: 0.04 });
    const sp500 = list(503, { 'Vereinigte Staaten': 0.99 });
    const nasdaq = list(101, { 'Vereinigte Staaten': 0.97 }, { IT: 0.6, Kommunikation: 0.15 });
    const names = {
      W: 'iShares Core MSCI World UCITS ETF USD (Acc)',
      E: 'iShares Core MSCI EM IMI UCITS ETF USD (Acc)',
      S: 'iShares STOXX Europe 600 UCITS ETF (DE)',
      U: 'iShares Core S&P 500 UCITS ETF USD (Acc)',
      N: 'iShares NASDAQ-100 UCITS ETF',
    };
    check('Zuordnung: World passt zu World', (matchScore(names.W, world) ?? 0) >= 0.75 && (matchScore(names.W, em) ?? 1) < 0.4 && (matchScore(names.W, sp500) ?? 1) < 0.4);
    check('Zuordnung: Emerging Markets passt zu EM', (matchScore(names.E, em) ?? 0) >= 0.75 && (matchScore(names.E, world) ?? 1) < 0.4);
    check('Zuordnung: Europa 600 passt zu Europa', (matchScore(names.S, europe) ?? 0) >= 0.75 && (matchScore(names.S, world) ?? 1) < 0.4);
    check('Zuordnung: S&P 500 nicht mit NASDAQ 100 verwechselt', (matchScore(names.U, sp500) ?? 0) >= 0.75 && (matchScore(names.U, nasdaq) ?? 1) < 0.4 && (matchScore(names.N, nasdaq) ?? 0) >= 0.75 && (matchScore(names.N, sp500) ?? 1) < 0.4);
    check('Zuordnung: abgekürzte Banknamen', (matchScore('ISHSIII-CORE MSCI WLD U.ETF', world) ?? 0) >= 0.75 && (matchScore('ISHS-CORE S+P 500 U.ETF', sp500) ?? 0) >= 0.75 && (matchScore('ISHS-CORE MSCI EM.MKTS IMI', em) ?? 0) >= 0.75 && (matchScore('ISHS ST.EUR.600 U.ETF DE', europe) ?? 0) >= 0.75);
    check('Zuordnung: Währung USD ist kein Hinweis auf die USA', (matchScore('iShares Core MSCI World UCITS ETF USD (Acc)', sp500) ?? 1) < 0.4);
    check('Zuordnung: nichtssagender Name → keine Aussage', matchScore('Fonds XY Thesaurierend', world) === null);

    const candidates = Object.entries(names).map(([isin, name]) => ({ isin, name }));
    // Dateien in beliebiger Reihenfolge
    const assigned = assignHoldings([nasdaq, europe, world, sp500, em], candidates);
    check('Zuordnung: fünf Listen richtig verteilt', assigned.map((a) => a.isin).join('') === 'NSWUE', assigned.map((a) => a.isin).join(''));
    check('Zuordnung: eindeutige Fälle als sicher markiert', assigned.every((a) => a.confident));
    // Zwei ETFs auf denselben Index: nicht unterscheidbar, also nur ein Vorschlag
    const twins = assignHoldings([world], [{ isin: 'A', name: 'iShares Core MSCI World' }, { isin: 'B', name: 'Xtrackers MSCI World Swap' }]);
    check('Zuordnung: zwei gleiche ETFs → nur Vorschlag', twins[0].isin !== null && !twins[0].confident);
    const extra = assignHoldings([world, em, europe], [{ isin: 'W', name: names.W }]);
    check('Zuordnung: mehr Listen als ETFs → Rest bleibt offen', extra[0].isin === 'W' && extra[1].isin === null && extra[2].isin === null);
    check('Zuordnung: jeder ETF höchstens eine Liste', new Set(assignHoldings([world, world], candidates).map((a) => a.isin)).size === 2);
    check('Zuordnung: Kurzbeschreibung', describeFund(world, displayName) === '1.215 Positionen · Vereinigte Staaten 72 %, Japan 6 % · größte: Apple', describeFund(world, displayName));
  }

  // --- Geschäftsbereiche der größten Firmen ---
  {
    const search = (quotes: unknown[]) => async () => new Response(JSON.stringify({ quotes }), { status: 200 });
    const nvda = { symbol: 'NVDA', quoteType: 'EQUITY', longname: 'NVIDIA Corporation', industry: 'Semiconductors' };
    check('Bereich: Treffer übernommen', (await findIndustry(search([{ symbol: 'NVDL', quoteType: 'ETF', shortname: 'GraniteShares 2x Long NVDA' }, nvda]), 'Nvidia')) === 'Semiconductors');
    check('Bereich: anderer Firmenname verworfen', (await findIndustry(search([{ symbol: 'SAP.TO', quoteType: 'EQUITY', longname: 'Saputo Inc.', industry: 'Packaged Foods' }]), 'SAP')) === null);
    check('Bereich: Schreibweise mit Zusatz zählt', (await findIndustry(search([{ symbol: 'AMZN', quoteType: 'EQUITY', longname: 'Amazon.com, Inc.', industry: 'Internet Retail' }]), 'Amazon.com Inc')) === 'Internet Retail');

    const asked: string[] = [];
    const yahoo = async (url: string) => {
      const q = decodeURIComponent(new URL(url).searchParams.get('q') ?? '');
      asked.push(q);
      return new Response(JSON.stringify({ quotes: q === 'Nvidia' ? [nvda] : [] }), { status: 200 });
    };
    const now = new Date('2026-11-11T12:00:00Z');
    const first = await loadIndustries(yahoo, [{ key: 'NVIDIA', label: 'Nvidia' }, { key: 'UNBEKANNT', label: 'Unbekannt Ag' }], {}, now);
    check('Bereich: gefunden und nicht gefunden gemerkt', first?.NVIDIA.industry === 'Semiconductors' && first?.UNBEKANNT.industry === null);
    check('Bereich: zweiter Versuch mit bereinigtem Namen', asked.join('|') === 'Nvidia|Unbekannt Ag|UNBEKANNT', asked.join('|'));
    check('Bereich: nur Firmennamen in der Anfrage', asked.every((q) => !/\d/.test(q)));
    check('Bereich: Bekanntes wird nicht erneut gesucht', (await loadIndustries(yahoo, [{ key: 'NVIDIA', label: 'Nvidia' }, { key: 'UNBEKANNT', label: 'Unbekannt Ag' }], first!, now)) === null);
    check('Bereich: nicht Gefundenes nach einem Monat erneut', (await loadIndustries(yahoo, [{ key: 'UNBEKANNT', label: 'Unbekannt Ag' }], first!, new Date('2026-12-20T12:00:00Z'))) !== null);
    const offline = async () => {
      throw new Error('offline');
    };
    check('Bereich: offline ändert nichts', (await loadIndustries(offline, [{ key: 'NEU', label: 'Neu' }], first!, now)) === null);

    check('Bereich: deutsch und erklärt', industryInfo('Semiconductors').label === 'Halbleiter (Chips)' && industryInfo('Semiconductors').explain.includes('KI'));
    check('Bereich: Schreibweise mit langem Strich', industryInfo('Software—Application').label === industryInfo('Software - Application').label && industryInfo('Software—Application').label !== 'Software—Application');
    check('Bereich: Unbekanntes bleibt wie es ist', industryInfo('Something New').label === 'Something New' && industryInfo('Something New').explain === '');
    const firm = (key: string, weight: number) => ({ key, label: key, weight, sector: 'IT', country: 'USA', sources: 1 });
    const areas = industryBreakdown([firm('NVIDIA', 0.05), firm('BROADCOM', 0.02), firm('APPLE', 0.06), firm('OHNE', 0.01)], (key) => ({ NVIDIA: 'Semiconductors', BROADCOM: 'Semiconductors', APPLE: 'Consumer Electronics' })[key]);
    check('Bereich: nach Bereich zusammengefasst', areas.slices[0].label === 'Halbleiter (Chips)' && Math.abs(areas.slices[0].weight - 0.07) < 1e-9 && areas.slices[0].companies.join() === 'NVIDIA,BROADCOM');
    check('Bereich: Firmen ohne Bereich zählen nicht', areas.known === 3 && Math.abs(areas.covered - 0.13) < 1e-9);
  }

  // --- Überschneidung zwischen ETFs ---
  {
    const holding = (name: string, weight: number) => ({ name, weight, sector: 'IT', country: 'Vereinigte Staaten' });
    const fund = (top: ReturnType<typeof holding>[]) => ({ importedAt: 'x', asOf: null, count: top.length, sectors: {}, countries: {}, top }) as any;
    const pos = (isin: string, share: number) => ({ instrument: { isin, name: isin, shortName: isin, kind: 'ETF' }, share }) as any;
    const world = fund([holding('APPLE', 0.5), holding('ALPHABET CLASS A', 0.2), holding('ALPHABET CLASS C', 0.1), holding('NESTLE SA', 0.2)]);
    const usa = fund([holding('Apple Inc', 0.6), holding('Alphabet Inc', 0.4)]);
    const em = fund([holding('TSMC', 0.7), holding('TENCENT', 0.3)]);
    const res = analyzeOverlap([pos('W', 0.5), pos('U', 0.3), pos('E', 0.2)], { W: world, U: usa, E: em });
    // Apple min(0,5; 0,6) + Alphabet min(0,3; 0,4) = 0,8
    check('Überschneidung: kleinerer Anteil je Firma zählt', res.pairs[0].a.instrument.isin === 'W' && res.pairs[0].b.instrument.isin === 'U' && Math.abs(res.pairs[0].overlap - 0.8) < 1e-9, String(res.pairs[0].overlap));
    check('Überschneidung: Schreibweisen und Aktienklassen zusammengeführt', res.pairs[0].common === 2 && res.pairs[0].examples.join() === 'Apple,Alphabet', res.pairs[0].examples.join());
    check('Überschneidung: Stufen', res.pairs[0].level === 'high' && res.pairs[2].level === 'low' && res.pairs[2].overlap === 0);
    check('Überschneidung: alle Paare, stärkste zuerst', res.pairs.length === 3);
    // Apple und Alphabet liegen in W und U: (0,5 + 0,3) × 0,5 + (0,6 + 0,4) × 0,3 = 0,7
    check('Überschneidung: Anteil des Depots in mehrfach gehaltenen Firmen', Math.abs(res.duplicated - 0.7) < 1e-9 && res.duplicatedCount === 2, String(res.duplicated));
    check('Überschneidung: gleiche ETFs = 100 %', Math.abs(analyzeOverlap([pos('A', 0.5), pos('B', 0.5)], { A: world, B: world }).pairs[0].overlap - 1) < 1e-9);
    check('Überschneidung: ein ETF allein → kein Paar', analyzeOverlap([pos('W', 1)], { W: world }).pairs.length === 0);
    const cut = fund([holding('APPLE', 0.3)]);
    check('Überschneidung: unvollständige Liste wird erkannt', analyzeOverlap([pos('W', 0.5), pos('C', 0.5)], { W: world, C: cut }).pairs[0].coverageB < 0.9);
  }

  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
