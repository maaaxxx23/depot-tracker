import { snapshotOf } from '../comdirect/portfolio';
import type { StoredPortfolio } from '../data/backupFormat';
import { benchmarkPreference, marketCache } from '../data/store';
import { benchmarkByKey, loadMarketData, loadQuotes, MarketData, needsRefresh, quotesStale } from './yahoo';

/**
 * Hält die Yahoo-Daten aktuell: Kurshistorie höchstens alle 12 Stunden (oder bei neuen Positionen
 * bzw. gewechseltem Vergleichsindex), aktuelle Kurse höchstens alle 15 Minuten.
 * null, wenn nichts zu tun war oder der Abruf nichts brachte.
 */
export async function refreshMarket(stored: StoredPortfolio, cached: MarketData | null): Promise<MarketData | null> {
  const current = snapshotOf(stored.raw, '').prices;
  const choice = benchmarkByKey(await benchmarkPreference.get().catch(() => null));
  let market: MarketData;
  if (needsRefresh(cached, Object.keys(current)) || benchmarkByKey(cached?.benchmarkKey).key !== choice.key) {
    const history = await loadMarketData(fetch, current, choice);
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
