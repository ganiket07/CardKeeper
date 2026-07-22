import { computed, effect, Injectable, signal } from '@angular/core';
import { Game } from './models';
import { analyzeRound, capitalizeName, playerTotals, roundStatus, toNum } from './scoring';

const KEY = 'cardtable:game:v1';

@Injectable({ providedIn: 'root' })
export class GameService {
  /** The active game, or null when on the setup screen. */
  readonly game = signal<Game | null>(this.load());
  readonly settleOpen = signal(false);
  /** Index of a previously confirmed round currently unlocked for correction, if any. */
  readonly editRow = signal<number | null>(null);

  /** Cumulative totals per player, recomputed automatically. */
  readonly totals = computed(() => {
    const g = this.game();
    return g ? playerTotals(g) : [];
  });

  constructor() {
    // Autosave on every change.
    effect(() => {
      const g = this.game();
      try {
        if (g) localStorage.setItem(KEY, JSON.stringify(g));
        else localStorage.removeItem(KEY);
      } catch {
        // storage unavailable (private mode etc.) — game still works in-memory
      }
    });
  }

  start(names: string[], unlockRounds: number): void {
    const clean = names.map((n, i) => capitalizeName(n) || `Player ${i + 1}`);
    this.settleOpen.set(false);
    this.editRow.set(null);
    this.game.set({
      names: clean,
      rounds: [clean.map(() => '')],
      editedRounds: [],
      unlockRounds,
      active: clean.map(() => true),
    });
  }

  /** The current (last, unconfirmed) round is always editable; an unlocked past round also is. */
  isEditable(ri: number): boolean {
    const g = this.game();
    return !!g && (ri === g.rounds.length - 1 || ri === this.editRow());
  }

  /** Like isEditable, but also false for a removed member's frozen column. */
  isCellEditable(ri: number, ci: number): boolean {
    const g = this.game();
    return this.isEditable(ri) && !!g?.active[ci];
  }

  /**
   * Add a player mid-game. If their name (case-insensitively) matches a previously
   * removed member, that same frozen column is reactivated instead of creating a new
   * one, so their earlier history stays attached to them. Otherwise a new column is
   * appended: earlier rounds are backfilled with '0' (they weren't playing, so it can't
   * affect totals) and the current in-progress round gets a normal blank cell. Rejects
   * a name that clashes (case-insensitively) with a currently active player.
   */
  addMember(rawName: string): boolean {
    const g = this.game();
    if (!g) return false;
    const name = capitalizeName(rawName);
    if (!name) return false;
    const lower = name.toLowerCase();
    const activeClash = g.names.some((n, i) => g.active[i] && n.trim().toLowerCase() === lower);
    if (activeClash) return false;
    const rejoinIdx = g.names.findIndex((n, i) => !g.active[i] && n.trim().toLowerCase() === lower);
    this.mutate((gg) => {
      if (rejoinIdx !== -1) {
        gg.active[rejoinIdx] = true;
        gg.names[rejoinIdx] = name;
        const last = gg.rounds[gg.rounds.length - 1];
        if (last[rejoinIdx] === '0') last[rejoinIdx] = '';
      } else {
        gg.names.push(name);
        gg.active.push(true);
        const lastIdx = gg.rounds.length - 1;
        gg.rounds.forEach((row, ri) => {
          row.push(ri < lastIdx ? '0' : '');
        });
      }
    });
    return true;
  }

  /**
   * Remove a member without deleting their column: past values stay, the column is
   * frozen (no longer editable), and every round from here on prefills '0' for them.
   * Requires at least 2 active players to remain so the game stays playable.
   */
  removeMember(index: number): boolean {
    const g = this.game();
    if (!g || index < 0 || index >= g.names.length || !g.active[index]) return false;
    if (g.active.filter(Boolean).length <= 2) return false;
    this.mutate((gg) => {
      gg.active[index] = false;
      const last = gg.rounds[gg.rounds.length - 1];
      if (last[index] === '') last[index] = '0';
    });
    return true;
  }

  setUnlockRounds(n: number): void {
    this.mutate((g) => {
      g.unlockRounds = n;
    });
  }

  isEditedRound(ri: number): boolean {
    return !!this.game()?.editedRounds.includes(ri);
  }

  /**
   * Unlock a previously confirmed round for correction. Only the negative (loser)
   * cells stay editable — the winner's cell is blanked immediately so the tick is
   * ready right away, and its positive value can only ever come from confirmRound's
   * recalculation, never from manual typing.
   */
  beginEdit(ri: number): boolean {
    const g = this.game();
    if (!g || ri < 0 || ri >= g.rounds.length - 1) return false;
    this.editRow.set(ri);
    this.mutate((gg) => {
      const row = gg.rounds[ri];
      let target = row.findIndex((v) => toNum(v) > 0);
      if (target === -1) {
        target = row.reduce((best, v, i) => (toNum(v) > toNum(row[best]) ? i : best), 0);
      }
      row[target] = '';
    });
    return true;
  }

  cancelEdit(): void {
    this.editRow.set(null);
  }

  /** Subtract 5 from a cell (counter is minus-only). */
  minus(ri: number, ci: number): void {
    if (!this.isEditable(ri)) return;
    this.mutate((g) => {
      const cur = parseInt(g.rounds[ri][ci], 10);
      g.rounds[ri][ci] = String((isNaN(cur) ? 0 : cur) - 5);
    });
  }

  /**
   * Commit a manually typed value (digits and a single leading minus only).
   * Typed entries are always coerced negative — a positive value can only
   * come from the tick's auto-fill of the winner's cell.
   */
  setCell(ri: number, ci: number, raw: string): void {
    if (!this.isEditable(ri)) return;
    let v = raw.replace(/[^0-9-]/g, '');
    v = v.replace(/(?!^)-/g, '');
    if (v && v !== '-' && v !== '0' && !v.startsWith('-')) {
      v = '-' + v;
    }
    this.mutate((g) => {
      g.rounds[ri][ci] = v;
    });
  }

  /**
   * Tick: fill the single blank with the balancing value.
   * For the active round this opens a new round as usual; for a round unlocked
   * via beginEdit() it instead just re-locks that round and marks it as edited.
   */
  confirmRound(ri: number): void {
    const g = this.game();
    if (!g || !roundStatus(g.rounds[ri]).ready) return;
    const info = analyzeRound(g.rounds[ri]);
    const editing = ri === this.editRow();
    this.mutate((gg) => {
      gg.rounds[ri][info.blanks[0]] = String(info.fill);
      if (editing) {
        if (!gg.editedRounds.includes(ri)) gg.editedRounds = [...gg.editedRounds, ri];
      } else {
        gg.rounds.push(gg.names.map((_, i) => (gg.active[i] ? '' : '0')));
      }
    });
    if (editing) this.editRow.set(null);
  }

  deleteRound(ri: number): void {
    this.mutate((g) => {
      g.rounds.splice(ri, 1);
      if (g.rounds.length === 0) g.rounds.push(g.names.map((_, i) => (g.active[i] ? '' : '0')));
      g.editedRounds = g.editedRounds.filter((x) => x !== ri).map((x) => (x > ri ? x - 1 : x));
    });
    if (this.editRow() === ri) this.editRow.set(null);
  }

  rename(i: number, name: string): void {
    this.mutate((g) => {
      g.names[i] = capitalizeName(name) || `Player ${i + 1}`;
    });
  }

  toggleSettle(): void {
    this.settleOpen.update((v) => !v);
  }

  reset(): void {
    this.settleOpen.set(false);
    this.editRow.set(null);
    this.game.set(null);
  }

  private mutate(fn: (g: Game) => void): void {
    const g = this.game();
    if (!g) return;
    const copy: Game = {
      names: [...g.names],
      rounds: g.rounds.map((r) => [...r]),
      editedRounds: [...g.editedRounds],
      unlockRounds: g.unlockRounds,
      active: [...g.active],
    };
    fn(copy);
    this.game.set(copy);
  }

  private load(): Game | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const g = JSON.parse(raw);
        if (g && Array.isArray(g.names) && Array.isArray(g.rounds)) {
          if (!Array.isArray(g.editedRounds)) g.editedRounds = [];
          if (typeof g.unlockRounds !== 'number') g.unlockRounds = 0;
          if (!Array.isArray(g.active) || g.active.length !== g.names.length) {
            g.active = g.names.map(() => true);
          }
          return g;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }
}
