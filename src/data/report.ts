// Berichte zum Teilen: die Jahresübersicht als druckbares HTML (wird zum PDF)
// und alle gesammelten Umsätze als CSV. Reine Textbausteine ohne Geräte-Zugriff,
// damit sie in den Skripten testbar sind.

import type { PositionResult } from '../finance/performance';
import type { YearsOverview } from '../finance/years';
import type { PortfolioData } from '../types';
import { eur, pct, percent, quantity, signedEur } from '../ui/format';

/** Deutsches Dezimalkomma mit zwei Nachkommastellen, ohne Tausendertrennung (CSV-tauglich). */
const num = (n: number) => n.toFixed(2).replace('.', ',');
/** Stückzahlen behalten ihre Nachkommastellen. */
const qty = (n: number) => String(n).replace('.', ',');

const TYPE_LABEL = { buy: 'Kauf', sell: 'Verkauf', dividend: 'Ausschüttung' } as const;

/** Alle gesammelten Umsätze als CSV (Semikolon-getrennt), z. B. für Excel oder Numbers. */
export function buildTransactionsCsv(data: PortfolioData): string {
  const name = (isin: string) => data.instruments.find((i) => i.isin === isin)?.name ?? '';
  const field = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = [...data.transactions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => [t.date, TYPE_LABEL[t.type], field(name(t.isin)), t.isin, qty(t.quantity), num(t.amount), num(t.fees)].join(';'));
  // Das BOM sorgt dafür, dass Excel unter Windows die Umlaute richtig liest
  return '﻿' + ['Datum;Typ;Wertpapier;ISIN;Stück;Betrag in EUR;Gebühren in EUR', ...rows].join('\n');
}

const css = `
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #111114; margin: 36px; }
  h1 { font-size: 22px; margin: 0; }
  .sub { color: #6b6b76; font-size: 12px; margin: 4px 0 24px; }
  h2 { font-size: 15px; margin: 24px 0 8px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th { text-align: right; color: #6b6b76; font-weight: 600; border-bottom: 1px solid #b98200; padding: 6px 8px; }
  th:first-child, td:first-child { text-align: left; padding-left: 0; }
  td { text-align: right; padding: 6px 8px; border-bottom: 0.5px solid #e3e3e8; font-variant-numeric: tabular-nums; }
  .plus { color: #1a8f4e; } .minus { color: #d1342f; }
  .foot { color: #6b6b76; font-size: 10px; margin-top: 28px; }
`;

const signed = (n: number) => `<span class="${n >= 0 ? 'plus' : 'minus'}">${signedEur(n)}</span>`;
const dash = (n: number, render: (v: number) => string) => (Math.abs(n) < 0.005 ? '–' : render(n));
const day = (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
const dayIso = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
/** Wertpapiernamen kommen von der Bank und gehören escaped ins HTML. */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Die Jahresübersicht als druckbare HTML-Seite; expo-print macht daraus das PDF. */
export function buildYearReportHtml(data: PortfolioData, overview: YearsOverview, benchmarkName: string | null, positions: PositionResult[] = [], createdAt = new Date()): string {
  const { years, total } = overview;
  const current = years.find((y) => y.running)?.endValue ?? 0;
  const header = ['Jahr', 'Rendite', ...(benchmarkName ? [benchmarkName] : []), 'Gewinn', 'Gekauft', 'Verkauft', 'Ausschüttungen', 'Wert Ende'];
  const rows = years.map((y) =>
    [
      `${y.year}${y.running ? ' (bisher)' : ''}`,
      pct(y.twr),
      ...(benchmarkName ? [pct(y.benchmarkReturn)] : []),
      signed(y.gain),
      dash(y.bought, eur),
      dash(y.sold, eur),
      dash(y.dividends, eur),
      eur(y.endValue),
    ]
      .map((cell) => `<td>${cell}</td>`)
      .join(''),
  );
  const source = data.source.kind === 'comdirect' ? `comdirect-Abruf, Stand ${dayIso(data.asOf)}` : 'Demo-Daten';
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><style>${css}</style></head><body>
    <h1>Jahresbericht</h1>
    <div class="sub">${source}</div>
    <h2>Gesamt</h2>
    <table>
      <tr><td>Depotwert heute</td><td>${eur(current)}</td></tr>
      <tr><td>Gewinn seit Beginn</td><td>${signed(total.gain)}</td></tr>
      <tr><td>davon Buchgewinn</td><td>${signed(total.open)}</td></tr>
      <tr><td>davon realisiert (vor Steuern)</td><td>${dash(total.realized, signed)}</td></tr>
      <tr><td>davon Ausschüttungen (netto)</td><td>${dash(total.dividends, eur)}</td></tr>
    </table>
    ${
      positions.length
        ? `<h2>Positionen heute</h2>
    <table>
      <tr><th>Wertpapier</th><th>Stück</th><th>Wert</th><th>Anteil</th></tr>
      ${positions.map((p) => `<tr><td>${esc(p.instrument.name)}</td><td>${quantity(p.quantity)}</td><td>${eur(p.value)}</td><td>${percent(p.share)}</td></tr>`).join('\n')}
    </table>`
        : ''
    }
    <h2>Jahre</h2>
    <table>
      <tr>${header.map((h) => `<th>${h}</th>`).join('')}</tr>
      ${rows.map((r) => `<tr>${r}</tr>`).join('\n')}
    </table>
    <div class="foot">
      Erstellt mit Depot Tracker am ${day(createdAt)}. Rendite ist die zeitgewichtete Kursentwicklung des Jahres;
      realisierte Gewinne nach „zuerst gekauft, zuerst verkauft“, vor Steuern. Alle Angaben ohne Gewähr,
      keine Anlage- oder Steuerberatung.
    </div>
  </body></html>`;
}
