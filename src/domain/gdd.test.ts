import { describe, expect, it } from 'vitest';
import { accumulateGdd, dailyGdd } from './gdd';

describe('dailyGdd', () => {
  it('returns mean temp minus base when positive', () => {
    expect(dailyGdd(10, 20, 6)).toBe(9); // mean 15, base 6
  });

  it('clamps to zero on cold days below the base temperature', () => {
    expect(dailyGdd(-2, 4, 10)).toBe(0); // mean 1, base 10 -> clamped
  });
});

describe('accumulateGdd', () => {
  it('sums daily contributions', () => {
    const days = [
      { tMinC: 10, tMaxC: 20 }, // 9
      { tMinC: 12, tMaxC: 18 }, // 9
      { tMinC: 0, tMaxC: 6 }, // 0
    ];
    expect(accumulateGdd(days, 6)).toBe(18);
  });

  it('is zero for no days', () => {
    expect(accumulateGdd([], 6)).toBe(0);
  });
});
