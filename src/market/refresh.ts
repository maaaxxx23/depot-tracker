import { snapshotOf } from '../comdirect/portfolio';
import type { StoredPortfolio } from '../data/backupFormat';
import { marketCache } from '../data/store';
import { loadMarketData, loadQuotes, MarketData, needsRefresh, quotesStale } from './yahoo';

/**
 * Hält die Yahoo-Daten aktuell: Kurshistorie höchstens alle 12 Stunden (oder bei neuen Positionen),
 * aktuelle Kurse höchstens alle 15 Minuten. null, wenn nichts zu tun war oder der Abruf nichts brachte.
 */
export async function refreshMarket(stored: StoredPortfolio, cached: MarketData | null): Promise<MarketData | null> {
  const current = snapshotOf(stored.raw, '').prices;
  let market: MarketData;
  if (needsRefresh(cached, Object.keys(current))) {
    const history = await loadMarketData(fetch, current);
    // Ein komplett gescheiterter Abruf (z. B. offline) überschreibt keinen brauchbaren alten Stand
    if (!history.benchmark && Object.keys(history.series).length === 0 && cached) return null;
    market = await loadQuotes(fetch, history);
  } else if (cached && quotesStale(cached)) {
    market = await loadQuotes(fetch, cached);
    if (Object.keys(market.quotes ?? {}).length === 0 && !market.benchmarkQuote) return null;
  } else {
    return null;
  }
  await marketCache.set(market);
  return market;
}
