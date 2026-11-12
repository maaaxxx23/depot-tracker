import { Instrument, PortfolioData, PricePoint, PriceHistory, Transaction } from '../types';
import { priceAt } from '../finance/performance';

// Erfundene Kurse und Umsätze, damit die App ohne comdirect-Zugang läuft.

const WORLD = 'DEMO-WORLD';
const EM = 'DEMO-EM';
const STOCK = 'DEMO-STOCK';

const instruments: Instrument[] = [
  { isin: WORLD, name: 'MSCI World ETF (thesaurierend)', shortName: 'MSCI World', kind: 'ETF' },
  { isin: EM, name: 'MSCI Emerging Markets ETF', shortName: 'Emerging Markets', kind: 'ETF' },
  { isin: STOCK, name: 'Musterfirma AG', shortName: 'Musterfirma', kind: 'Aktie' },
];

const SPARPLAN_FEE = 0.015;
const ORDER_FEE = 9.9;

const pad = (n: number) => String(n).padStart(2, '0');
const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

/** Deterministischer Zufallsgenerator, damit die Demo bei jedem Start gleich aussieht. */
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussians(count: number, seed: number): number[] {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => {
    const u = Math.max(rand(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  });
}

function monthStarts(from: string, to: string): string[] {
  const dates: string[] = [];
  let [y, m] = from.split('-').map(Number);
  for (;;) {
    const date = `${y}-${pad(m)}-01`;
    if (date > to) return dates;
    dates.push(date);
    if (m === 12) {
      y += 1;
      m = 1;
    } else {
      m += 1;
    }
  }
}

/** Monatliche Kurse als Random Walk, korreliert über einen gemeinsamen Marktfaktor. */
function priceSeries(dates: string[], start: number, drift: number, vol: number, market: number[], beta: number, seed: number): PricePoint[] {
  const own = gaussians(dates.length, seed);
  let price = start;
  return dates.map((date, i) => {
    if (i > 0) {
      const z = beta * market[i] + Math.sqrt(1 - beta * beta) * own[i];
      price *= Math.exp(drift / 12 - (vol * vol) / 24 + (vol / Math.sqrt(12)) * z);
    }
    return { date, price: round(price, 2) };
  });
}

export function createDemoData(asOf = new Date().toISOString().slice(0, 10)): PortfolioData {
  const dates = monthStarts('2020-12-01', asOf);
  const market = gaussians(dates.length, 7);
  const prices: PriceHistory = {
    [WORLD]: priceSeries(dates, 62, 0.05, 0.15, market, 1, 11),
    [EM]: priceSeries(dates, 31, 0.04, 0.18, market, 0.7, 23),
    [STOCK]: priceSeries(dates, 180, 0.07, 0.24, market, 0.5, 42),
  };

  const transactions: Transaction[] = [];
  const buy = (date: string, isin: string, quantity: number, fees: number) =>
    transactions.push({ date, isin, type: 'buy', quantity, amount: round(quantity * priceAt(prices, isin, date), 2), fees });

  // Monatliche Sparpläne
  for (const month of monthStarts('2021-01-01', asOf)) {
    const date = month.slice(0, 8) + '02';
    if (date > asOf) break;
    for (const [isin, rate] of [[WORLD, 300], [EM, 75]] as const) {
      const fees = round(rate * SPARPLAN_FEE, 2);
      buy(date, isin, round((rate - fees) / priceAt(prices, isin, date), 3), fees);
    }
  }

  // Einzelaktie: Kauf, Teilverkauf, jährliche Dividende
  buy('2022-03-15', STOCK, 40, ORDER_FEE);
  if ('2025-06-10' <= asOf) {
    const quantity = 15;
    transactions.push({ date: '2025-06-10', isin: STOCK, type: 'sell', quantity, amount: round(quantity * priceAt(prices, STOCK, '2025-06-10'), 2), fees: ORDER_FEE });
  }
  for (let year = 2023; `${year}-05-10` <= asOf; year++) {
    const date = `${year}-05-10`;
    const shares = date < '2025-06-10' ? 40 : 25;
    transactions.push({ date, isin: STOCK, type: 'dividend', quantity: 0, amount: round(shares * 3.2, 2), fees: 0 });
  }

  return { instruments, transactions, prices, benchmark: { isin: WORLD, name: 'MSCI World' }, asOf, source: { kind: 'demo' } };
}
