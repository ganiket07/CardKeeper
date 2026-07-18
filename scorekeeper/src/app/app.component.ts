import { Component, computed, signal } from '@angular/core';
import { GameService } from './game.service';
import { analyzeRound, fmt, isFilled, roundStatus, toNum } from './scoring';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  readonly count = signal(3);
  readonly names = signal<string[]>(['', '', '']);

  readonly editPromptOpen = signal(false);
  readonly editRowInput = signal('');

  readonly fmt = fmt;
  readonly isFilled = isFilled;
  readonly toNum = toNum;
  readonly round = Math.round;

  constructor(public svc: GameService) {}

  incCount(): void {
    if (this.count() < 8) {
      this.count.update((c) => c + 1);
      this.names.update((n) => [...n, '']);
    }
  }
  decCount(): void {
    if (this.count() > 2) {
      this.count.update((c) => c - 1);
      this.names.update((n) => n.slice(0, -1));
    }
  }
  setName(i: number, value: string): void {
    this.names.update((n) => {
      const c = [...n];
      c[i] = value;
      return c;
    });
  }
  start(): void {
    this.svc.start(this.names());
  }

  status(row: string[]) {
    return roundStatus(row);
  }
  isErr(row: string[], ci: number): boolean {
    return this.status(row).errCells.has(ci);
  }
  ready(row: string[]): boolean {
    return this.status(row).ready;
  }
  /** True for the sole remaining blank cell in a row (the winner slot the tick will fill). */
  isLastField(row: string[], ci: number): boolean {
    const info = analyzeRound(row);
    return info.blanks.length === 1 && info.blanks[0] === ci;
  }
  commitCell(ri: number, ci: number, ev: Event): void {
    this.svc.setCell(ri, ci, (ev.target as HTMLInputElement).value);
  }

  readonly messages = computed<string[]>(() => {
    const g = this.svc.game();
    if (!g) return [];
    const out: string[] = [];
    g.rounds.forEach((row, ri) => {
      const s = roundStatus(row);
      if (s.msg) out.push(`Round ${ri + 1}: ${s.msg}.`);
    });
    return out;
  });

  readonly netZero = computed<boolean>(() => {
    const t = this.svc.totals();
    return Math.round(t.reduce((a, b) => a + b, 0)) === 0;
  });

  readonly sortedSettle = computed(() => {
    const g = this.svc.game();
    const t = this.svc.totals();
    if (!g) return [] as { name: string; total: number; idx: number }[];
    return g.names
      .map((name, idx) => ({ name, total: t[idx], idx }))
      .sort((a, b) => b.total - a.total);
  });

  initials(name: string): string {
    return (name || '?').trim().slice(0, 2).toUpperCase() || '?';
  }
  colorFor(i: number): string {
    const c = ['#2E6A4E', '#B23A3A', '#3C6E9C', '#8A5A12', '#6B4E9C', '#1E7A72', '#9C3C6E', '#6E6A2E'];
    return c[i % c.length];
  }
  confirmNewGame(): void {
    if (confirm('Start a new game? Your current scores will be cleared.')) {
      this.count.set(3);
      this.names.set(['', '', '']);
      this.svc.reset();
    }
  }

  openEditPrompt(): void {
    this.editRowInput.set('');
    this.editPromptOpen.set(true);
  }
  closeEditPrompt(): void {
    this.editPromptOpen.set(false);
  }
  setEditRowInput(value: string): void {
    this.editRowInput.set(value.replace(/[^0-9]/g, ''));
  }
  confirmEditPrompt(): void {
    const n = parseInt(this.editRowInput(), 10);
    const lastCompleted = (this.svc.game()?.rounds.length ?? 1) - 1;
    if (isNaN(n) || !this.svc.beginEdit(n - 1)) {
      alert(
        lastCompleted < 1
          ? 'No completed rounds yet to edit.'
          : `Enter a completed round number between 1 and ${lastCompleted}.`
      );
      return;
    }
    this.closeEditPrompt();
  }
}
