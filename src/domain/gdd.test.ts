import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
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

// Property-based tests pin the *invariants the plan specifies* (PLAN.md §5.1), not
// just hand-picked examples — fast-check searches the input space for counterexamples
// and shrinks any failure to a minimal case. See TESTING.md ("Catching bugs").
describe('GDD invariants (property-based, PLAN.md §5.1)', () => {
  // Realistic-but-wide bounds; finite, no NaN, so the maths stays well-defined.
  const temp = fc.double({ min: -40, max: 60, noNaN: true, noDefaultInfinity: true });
  const base = fc.double({ min: 0, max: 20, noNaN: true, noDefaultInfinity: true });
  const intTemp = fc.integer({ min: -40, max: 60 });

  it('is never negative — heat below the base contributes nothing', () => {
    fc.assert(
      fc.property(temp, temp, base, (a, b, baseTempC) => {
        expect(dailyGdd(a, b, baseTempC)).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('equals max(0, mean − base) — the formula in §5.1, exactly', () => {
    fc.assert(
      fc.property(temp, temp, base, (a, b, baseTempC) => {
        const expected = Math.max(0, (a + b) / 2 - baseTempC);
        expect(dailyGdd(a, b, baseTempC)).toBe(expected);
      }),
    );
  });

  it('is monotonic in temperature — a warmer day never accrues less heat', () => {
    fc.assert(
      fc.property(
        temp,
        temp,
        base,
        fc.double({ min: 0, max: 30, noNaN: true }),
        (a, b, baseTempC, warmer) => {
          expect(dailyGdd(a, b + warmer, baseTempC)).toBeGreaterThanOrEqual(
            dailyGdd(a, b, baseTempC),
          );
        },
      ),
    );
  });

  it('is never negative and never decreases as more days are added', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ tMinC: temp, tMaxC: temp }), { maxLength: 40 }),
        fc.record({ tMinC: temp, tMaxC: temp }),
        base,
        (days, extra, baseTempC) => {
          const total = accumulateGdd(days, baseTempC);
          expect(total).toBeGreaterThanOrEqual(0);
          // each day contributes ≥ 0, so appending one never reduces the total.
          expect(accumulateGdd([...days, extra], baseTempC)).toBeGreaterThanOrEqual(total);
        },
      ),
    );
  });

  it('is order-independent for whole-degree temperatures and base', () => {
    // Integer temps and base make every daily GDD an exact half-degree, so the sum
    // is associative in floating point and day order cannot change the total. (With
    // fractional inputs, ordering can shift the result by a rounding ULP — a property
    // worth stating precisely rather than over-claiming bit-equality, see TESTING.md.)
    fc.assert(
      fc.property(
        fc.array(fc.record({ tMinC: intTemp, tMaxC: intTemp }), { maxLength: 40 }),
        fc.integer({ min: 0, max: 20 }),
        (days, baseTempC) => {
          expect(accumulateGdd([...days].reverse(), baseTempC)).toBe(
            accumulateGdd(days, baseTempC),
          );
        },
      ),
    );
  });
});
