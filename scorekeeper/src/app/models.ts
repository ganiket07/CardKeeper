export interface Game {
  names: string[];
  /** Each round is one string per player. '' means an empty cell. */
  rounds: string[][];
  /** Indices of confirmed rounds that were later unlocked and corrected. */
  editedRounds: number[];
  /** Rounds that must be played before the settle up option unlocks. */
  unlockRounds: number;
  /** Whether each column (by index) is currently playing. Removed members stay in
   *  the data as a frozen column instead of being deleted. */
  active: boolean[];
}

export interface RoundInfo {
  blanks: number[];
  sum: number;
  /** value that would balance the round to zero, i.e. -(sum of filled cells) */
  fill: number;
  positives: number;
  /** indices of cells that are not multiples of 5 */
  bad: number[];
}

export interface RoundStatus {
  /** true when the tick may be pressed */
  ready: boolean;
  /** validation message, or null when the round is fine */
  msg: string | null;
  /** cell indices to flag as invalid */
  errCells: Set<number>;
}
