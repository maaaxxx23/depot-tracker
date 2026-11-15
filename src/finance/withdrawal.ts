// Entnahme als Modellrechnung: welches Depot eine Wunsch-Entnahme trägt – und umgekehrt,
// was das heutige Depot tragen würde. Grobe Faustformeln ohne Steuern und Inflation,
// eine Beobachtungshilfe, keine Empfehlung.

/** Wunsch-Entnahme, wie sie gespeichert und gesichert wird. */
export interface WithdrawalWish {
  /** Entnahme pro Monat in Euro */
  monthly: number;
  /** Jahre, über die das Depot beim Verzehr reichen soll */
  years: number;
}

export const CONSUME_YEARS_DEFAULT = 30;
export const CONSUME_YEARS_MIN = 10;
export const CONSUME_YEARS_MAX = 60;
export const CONSUME_YEARS_STEP = 5;

/** Rendite pro Monat, die aufs Jahr gerechnet `annualReturn` ergibt. */
const monthlyRate = (annualReturn: number) => Math.pow(1 + annualReturn, 1 / 12) - 1;

/**
 * Depot, das eine monatliche Entnahme dauerhaft trägt: Die Entnahme kommt allein aus der
 * Rendite, das Depot bleibt rechnerisch unverändert. null = ohne Rendite nicht möglich.
 */
export function capitalToPreserve(monthly: number, annualReturn: number): number | null {
  if (!(monthly > 0)) return null;
  const i = monthlyRate(annualReturn);
  return i > 0 ? monthly / i : null;
}

/** Depot, das bei monatlicher Entnahme nach `years` Jahren genau aufgebraucht ist. */
export function capitalToConsume(monthly: number, annualReturn: number, years: number): number | null {
  if (!(monthly > 0) || !(years > 0)) return null;
  const i = monthlyRate(annualReturn);
  const months = Math.round(years * 12);
  return i > 0 ? (monthly * (1 - Math.pow(1 + i, -months))) / i : monthly * months;
}

/** Monatliche Entnahme, die ein Depot dauerhaft trägt, ohne zu schrumpfen. */
export function monthlyFromCapital(capital: number, annualReturn: number): number {
  return capital > 0 ? capital * monthlyRate(annualReturn) : 0;
}

/** Rundet ein errechnetes Zielkapital auf einen ruhigen Betrag (volle Tausender). */
export function roundCapital(capital: number): number {
  return Math.max(1000, Math.round(capital / 1000) * 1000);
}
