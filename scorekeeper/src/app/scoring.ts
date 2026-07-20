import { Game, RoundInfo, RoundStatus } from './models';

export const isFilled = (v: string): boolean =>
  v !== '' && v !== '-' && !isNaN(parseInt(v, 10));

export const toNum = (v: string): number => (isFilled(v) ? parseInt(v, 10) : 0);

/** Analyse a single round: blanks, running sum, balancing fill, positives, invalid cells. */
export function analyzeRound(row: string[]): RoundInfo {
  const blanks: number[] = [];
  const bad: number[] = [];
  let sum = 0;
  let positives = 0;
  row.forEach((v, i) => {
    if (isFilled(v)) {
      const x = parseInt(v, 10);
      sum += x;
      if (x > 0) positives++;
      if (x % 5 !== 0) bad.push(i);
    } else {
      blanks.push(i);
    }
  });
  return { blanks, sum, fill: -sum, positives, bad };
}

/**
 * Decide whether a round's tick is pressable and surface any validation message.
 * Rules: entries must be multiples of 5; at most one positive per round; the tick
 * is enabled only when exactly one cell is blank and filling it keeps positives <= 1.
 */
export function roundStatus(row: string[]): RoundStatus {
  const a = analyzeRound(row);
  const errCells = new Set<number>(a.bad);
  let msg: string | null = null;
  let ready = false;

  if (a.bad.length) {
    msg = 'scores must be multiples of 5';
  } else if (a.positives > 1) {
    row.forEach((v, i) => {
      if (isFilled(v) && parseInt(v, 10) > 0) errCells.add(i);
    });
    msg = 'only one player can be positive';
  } else if (a.blanks.length === 1) {
    const prospective = a.positives + (a.fill > 0 ? 1 : 0);
    if (prospective <= 1) ready = true;
    else msg = 'filling the blank would make two positives';
  }

  return { ready, msg, errCells };
}

/** Cumulative total per player across all rounds. */
export function playerTotals(game: Game): number[] {
  const totals = game.names.map(() => 0);
  for (const row of game.rounds) {
    row.forEach((v, i) => {
      totals[i] += toNum(v);
    });
  }
  return totals;
}

export interface Settlement {
  fromIdx: number;
  toIdx: number;
  amount: number;
}

/**
 * Reduce per-player totals to a minimal-ish set of payments (largest debtor pays
 * largest creditor, repeat) instead of everyone settling with everyone.
 */
export function simplifySettlement(totals: number[]): Settlement[] {
  const creditors = totals
    .map((t, i) => ({ i, amt: Math.round(t) }))
    .filter((x) => x.amt > 0)
    .sort((a, b) => b.amt - a.amt);
  const debtors = totals
    .map((t, i) => ({ i, amt: -Math.round(t) }))
    .filter((x) => x.amt > 0)
    .sort((a, b) => b.amt - a.amt);

  const out: Settlement[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci];
    const d = debtors[di];
    const amount = Math.min(c.amt, d.amt);
    if (amount > 0) out.push({ fromIdx: d.i, toIdx: c.i, amount });
    c.amt -= amount;
    d.amt -= amount;
    if (c.amt === 0) ci++;
    if (d.amt === 0) di++;
  }
  return out;
}

/** Signed display string, e.g. +10, 0, or −5 (real minus glyph). */
export const fmt = (n: number): string => {
  n = Math.round(n);
  if (n > 0) return '+' + n;
  if (n < 0) return '\u2212' + Math.abs(n);
  return '0';
};
