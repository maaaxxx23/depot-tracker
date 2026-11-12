const eurFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const pctFormat = new Intl.NumberFormat('de-DE', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const eur = (n: number) => eurFormat.format(n);
export const signedEur = (n: number) => (n > 0 ? '+' : '') + eurFormat.format(n);
export const pct = (n: number | null) => (n === null ? '–' : (n > 0 ? '+' : '') + pctFormat.format(n));
export const percent = (n: number) => pctFormat.format(n);

/** Prozentwert ohne unnötige Nachkommastelle: „5 %“, „5,5 %“. */
export const shortPercent = (n: number) => `${(n * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;

/** Tag und Monat: „05.11.“ */
export const dayMonth = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

/** Differenz zweier Renditen in Prozentpunkten, ohne Vorzeichen: „5,7 %-Pkt.“ */
export const points = (n: number) => `${(Math.abs(n) * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %-Pkt.`;

export const dateTime = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export const quantity = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 3 });
export const price = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

/** Kurzform für Achsen: 12,3 T€ */
export const compactEur = (n: number) =>
  Math.abs(n) >= 1000 ? `${(n / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} T€` : `${Math.round(n)} €`;

const WEEKDAYS = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];

/** „heute, 08:12“, „gestern, 21:30“, „Mo., 21:30“ (diese Woche) oder „03.11., 21:30“. */
export function relativeTime(d: Date, now = new Date()): string {
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86400000);
  if (days <= 0) return `heute, ${time}`;
  if (days === 1) return `gestern, ${time}`;
  if (days < 7) return `${WEEKDAYS[d.getDay()]}, ${time}`;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}., ${time}`;
}

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** „März 2029“ aus „2029-03“ (oder einem ganzen ISO-Datum). */
export const monthName = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

export const monthYear = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
