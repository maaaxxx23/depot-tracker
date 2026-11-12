export interface Flow {
  date: Date;
  amount: number; // negativ = Einzahlung, positiv = Auszahlung/Endwert
}

const DAY_MS = 86_400_000;

/**
 * Geldgewichtete Rendite p.a. (XIRR): der Zinssatz, bei dem der Barwert
 * aller Zahlungen null ergibt. Liefert null, wenn es keine Lösung gibt.
 */
export function xirr(flows: Flow[]): number | null {
  const relevant = flows.filter((f) => f.amount !== 0);
  if (!relevant.some((f) => f.amount > 0) || !relevant.some((f) => f.amount < 0)) return null;

  const t0 = Math.min(...relevant.map((f) => f.date.getTime()));
  const terms = relevant.map((f) => ({ years: (f.date.getTime() - t0) / DAY_MS / 365, amount: f.amount }));
  const npv = (r: number) => terms.reduce((sum, { years, amount }) => sum + amount / Math.pow(1 + r, years), 0);
  const dnpv = (r: number) =>
    terms.reduce((sum, { years, amount }) => sum - (years * amount) / Math.pow(1 + r, years + 1), 0);

  // Newton-Verfahren konvergiert meist in wenigen Schritten
  let r = 0.1;
  for (let i = 0; i < 50; i++) {
    const value = npv(r);
    const slope = dnpv(r);
    if (!isFinite(value) || !isFinite(slope) || slope === 0) break;
    const next = r - value / slope;
    if (!isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - r) < 1e-10) return next;
    r = next;
  }

  // Fallback: Bisektion
  let lo = -0.9999;
  let hi = 10;
  let fLo = npv(lo);
  if (fLo * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}
