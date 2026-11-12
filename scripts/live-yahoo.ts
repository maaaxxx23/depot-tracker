// Probeabruf gegen das echte Yahoo mit öffentlichen Beispiel-ISINs: npx tsx scripts/live-yahoo.ts
import { loadMarketData, loadQuotes } from '../src/market/yahoo';
(async () => {
  const history = await loadMarketData(fetch, { IE00B4L5Y983: 128.5, IE00BKM4GZ66: 44, DE0007164600: 211 });
  const m = await loadQuotes(fetch, history);
  for (const [isin, pts] of Object.entries(m.series)) {
    console.log(isin, m.symbols?.[isin], 'letzte Wochen:', pts.slice(-2).map((p) => `${p.date} ${p.price.toFixed(2)}`).join(' | '), '· aktuell:', m.quotes?.[isin] ? `${m.quotes[isin].date} ${m.quotes[isin].price.toFixed(2)} EUR (${m.quotes[isin].time})` : 'fehlt');
  }
  console.log('MSCI World aktuell:', m.benchmarkQuote?.price, m.benchmarkQuote?.time);
})();
