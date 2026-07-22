import { Component, computed, ElementRef, effect, signal, viewChild } from '@angular/core';
import { GameService } from './game.service';
import { analyzeRound, capitalizeName, fmt, isFilled, roundStatus, simplifySettlement, toNum } from './scoring';

const DEFAULT_ROSTER = ['Aniket', 'Rahul', 'Sandesh', 'Ranjit', 'Bivash'];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  readonly roster = signal<string[]>([...DEFAULT_ROSTER]);
  readonly selected = signal<Set<number>>(new Set());
  readonly addingName = signal(false);
  readonly newNameInput = signal('');

  readonly roundsPromptOpen = signal(false);
  readonly roundsInput = signal('');

  readonly editPromptOpen = signal(false);
  readonly editRowInput = signal('');

  readonly memberPromptOpen = signal(false);
  readonly memberMode = signal<'menu' | 'add' | 'remove'>('menu');
  readonly newMemberInput = signal('');
  readonly removeMemberIdx = signal<number | null>(null);

  readonly editRoundsPromptOpen = signal(false);
  readonly editRoundsInput = signal('');

  readonly fmt = fmt;
  readonly isFilled = isFilled;
  readonly toNum = toNum;
  readonly round = Math.round;
  


  private readonly boardEl = viewChild<ElementRef<HTMLDivElement>>('boardEl');
  private readonly settleEl = viewChild<ElementRef<HTMLDivElement>>('settleEl');
  private lastRoundsLen = 0;

  constructor(public svc: GameService) {
    // Auto-scroll the rounds table to the newest round whenever one is added
    // (not on every cell edit, which also updates the game signal).
    effect(() => {
      const len = this.svc.game()?.rounds.length ?? 0;
      const grew = len > this.lastRoundsLen;
      this.lastRoundsLen = len;
      const el = this.boardEl()?.nativeElement;
      if (el && grew) {
        setTimeout(() => (el.scrollTop = el.scrollHeight));
      }
    });
    // Auto-scroll the page to the settle up preview when it's opened.
    effect(() => {
      const open = this.svc.settleOpen();
      const el = this.settleEl()?.nativeElement;
      if (open && el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }
    });
  }

  isSelected(i: number): boolean {
    return this.selected().has(i);
  }
  toggleSelect(i: number): void {
    this.selected.update((s) => {
      const c = new Set(s);
      if (c.has(i)) c.delete(i);
      else c.add(i);
      return c;
    });
  }
  readonly selectedNames = computed<string[]>(() =>
    this.roster().filter((_, i) => this.selected().has(i))
  );

  openAddName(): void {
    this.newNameInput.set('');
    this.addingName.set(true);
  }
  cancelAddName(): void {
    this.addingName.set(false);
    this.newNameInput.set('');
  }
  setNewNameInput(value: string): void {
    this.newNameInput.set(value);
  }
  confirmAddName(): void {
    const name = capitalizeName(this.newNameInput());
    if (!name) return;
    const newIndex = this.roster().length;
    this.roster.update((r) => [...r, name]);
    this.selected.update((s) => new Set(s).add(newIndex));
    this.cancelAddName();
  }

  openStartFlow(): void {
    if (this.selectedNames().length < 2) {
      alert('Select at least 2 players to start.');
      return;
    }
    this.roundsInput.set('');
    this.roundsPromptOpen.set(true);
  }
  closeRoundsPrompt(): void {
    this.roundsPromptOpen.set(false);
  }
  setRoundsInput(value: string): void {
    this.roundsInput.set(value.replace(/[^0-9]/g, ''));
  }
  confirmRoundsPrompt(): void {
    const n = parseInt(this.roundsInput(), 10);
    if (isNaN(n) || n <= 0) {
      alert('Enter a valid number of rounds.');
      return;
    }
    this.svc.start(this.selectedNames(), n);
    this.roundsPromptOpen.set(false);
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

  readonly completedRounds = computed<number>(() => (this.svc.game()?.rounds.length ?? 1) - 1);

  readonly settleUnlocked = computed<boolean>(() => {
    const g = this.svc.game();
    if (!g) return false;
    const n = g.unlockRounds;
    if (!n || n <= 0) return true;
    const c = this.completedRounds();
    return c > 0 && c % n === 0;
  });

  readonly roundsUntilUnlock = computed<number>(() => {
    const g = this.svc.game();
    if (!g) return 0;
    const n = g.unlockRounds;
    if (!n || n <= 0) return 0;
    return n - (this.completedRounds() % n);
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

  readonly settlementOpen = signal(false);
  readonly settlementPayments = computed(() => {
    const g = this.svc.game();
    if (!g) return [] as { fromIdx: number; toIdx: number; from: string; to: string; amount: number }[];
    return simplifySettlement(this.svc.totals()).map((s) => ({
      ...s,
      from: g.names[s.fromIdx],
      to: g.names[s.toIdx],
    }));
  });
  openSettlement(): void {
    this.settlementOpen.set(true);
  }
  closeSettlement(): void {
    this.settlementOpen.set(false);
  }

  initials(name: string): string {
    return (name || '?').trim().slice(0, 2).toUpperCase() || '?';
  }
  colorFor(i: number): string {
    const c = ['#2E6A4E', '#B23A3A', '#3C6E9C', '#8A5A12', '#6B4E9C', '#1E7A72', '#9C3C6E', '#6E6A2E'];
    return c[i % c.length];
  }
  confirmNewGame(): void {
    if (confirm('Start a new game? Your current scores will be cleared.')) {
      this.roster.set([...DEFAULT_ROSTER]);
      this.selected.set(new Set());
      this.cancelAddName();
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

  readonly activeMembersList = computed<{ name: string; idx: number }[]>(() => {
    const g = this.svc.game();
    if (!g) return [];
    return g.names.map((name, idx) => ({ name, idx })).filter((m) => g.active[m.idx]);
  });

  openMemberPrompt(): void {
    this.memberMode.set('menu');
    this.newMemberInput.set('');
    this.removeMemberIdx.set(null);
    this.memberPromptOpen.set(true);
  }
  closeMemberPrompt(): void {
    this.memberPromptOpen.set(false);
  }
  backToMemberMenu(): void {
    this.memberMode.set('menu');
  }
  chooseAddMember(): void {
    this.newMemberInput.set('');
    this.memberMode.set('add');
  }
  chooseRemoveMember(): void {
    this.removeMemberIdx.set(null);
    this.memberMode.set('remove');
  }
  setNewMemberInput(value: string): void {
    this.newMemberInput.set(value);
  }
  confirmAddMember(): void {
    const name = this.newMemberInput().trim();
    if (!name) return;
    if (!this.svc.addMember(name)) {
      alert('A player with that name is already in the game.');
      return;
    }
    this.closeMemberPrompt();
  }
  selectRemoveMember(idx: number): void {
    this.removeMemberIdx.set(idx);
  }
  confirmRemoveMember(): void {
    const idx = this.removeMemberIdx();
    if (idx === null) return;
    if (!this.svc.removeMember(idx)) {
      alert('At least 2 active players are required — cannot remove this member.');
      return;
    }
    this.closeMemberPrompt();
  }

  openEditRoundsPrompt(): void {
    this.editRoundsInput.set(String(this.svc.game()?.unlockRounds ?? ''));
    this.editRoundsPromptOpen.set(true);
  }
  closeEditRoundsPrompt(): void {
    this.editRoundsPromptOpen.set(false);
  }
  setEditRoundsInput(value: string): void {
    this.editRoundsInput.set(value.replace(/[^0-9]/g, ''));
  }
  confirmEditRoundsPrompt(): void {
    const n = parseInt(this.editRoundsInput(), 10);
    if (isNaN(n) || n <= 0) {
      alert('Enter a valid number of rounds.');
      return;
    }
    this.svc.setUnlockRounds(n);
    this.closeEditRoundsPrompt();
  }
}
