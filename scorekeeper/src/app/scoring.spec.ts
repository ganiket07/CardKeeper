import { analyzeRound, fmt, playerTotals, roundStatus } from './scoring';

describe('scoring logic', () => {
  it('auto-balances a single trailing blank to make the round total zero', () => {
    const info = analyzeRound(['-5', '-5', '']);
    expect(info.blanks).toEqual([2]);
    expect(info.fill).toBe(10);
  });

  it('fills a blank in any position, not just the last', () => {
    const info = analyzeRound(['-5', '', '-5']);
    expect(info.blanks).toEqual([1]);
    expect(info.fill).toBe(10);
  });

  it('enables the tick only with exactly one blank and valid scores', () => {
    expect(roundStatus(['-5', '-5', '']).ready).toBeTrue();
    expect(roundStatus(['-5', '', '']).ready).toBeFalse(); // two blanks
    expect(roundStatus(['-5', '-5', '-5']).ready).toBeFalse(); // no blank
  });

  it('rejects entries that are not multiples of 5', () => {
    const s = roundStatus(['-7', '-5', '']);
    expect(s.ready).toBeFalse();
    expect(s.msg).toContain('multiples of 5');
    expect(s.errCells.has(0)).toBeTrue();
  });

  it('allows at most one positive per round', () => {
    const s = roundStatus(['10', '5', '-15']);
    expect(s.msg).toContain('one player can be positive');
    expect(s.errCells.has(0)).toBeTrue();
    expect(s.errCells.has(1)).toBeTrue();
  });

  it('blocks a tick whose fill would create a second positive', () => {
    const s = roundStatus(['10', '-20', '']); // sum -10 -> fill +10, plus existing +10
    expect(s.ready).toBeFalse();
    expect(s.msg).toContain('two positives');
  });

  it('sums player totals across rounds', () => {
    const totals = playerTotals({
      names: ['A', 'B', 'C'],
      rounds: [
        ['-5', '10', '-5'],
        ['-5', '-5', '10'],
      ],
      editedRounds: [],
    });
    expect(totals).toEqual([-10, 5, 5]);
  });

  it('formats numbers with a sign', () => {
    expect(fmt(10)).toBe('+10');
    expect(fmt(0)).toBe('0');
    expect(fmt(-5)).toBe('\u22125');
  });
});
