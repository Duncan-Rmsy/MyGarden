import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { deriveFrostDates, deriveNormals, type DailyWeather } from './climate';

// Build a tiny weather series helper: one day with the given fields.
function day(date: string, tMinC: number, tMaxC = tMinC + 8, rainMm = 0): DailyWeather {
  return { date, tMinC, tMaxC, rainMm };
}

describe('deriveFrostDates', () => {
  it('averages the last spring and first autumn frost across years', () => {
    const days = [
      // 2020: last spring frost 04-10, first autumn frost 10-20
      day('2020-04-10', -1),
      day('2020-04-11', 3), // above threshold, ignored
      day('2020-10-20', -2),
      // 2021: last spring frost 04-20, first autumn frost 10-10
      day('2021-04-20', -1),
      day('2021-10-10', -1),
    ];
    // Spring DOYs: 101 (Apr 10, 2020 leap) and 110 (Apr 20, 2021) -> avg ~105.5
    // We assert the human-meaningful result rather than the raw DOY.
    const frost = deriveFrostDates(days, 0);
    expect(frost).not.toBeNull();
    expect(frost!.lastFrost).toBe('04-15');
    expect(frost!.firstFrost).toBe('10-15');
  });

  it('respects a custom threshold', () => {
    const days = [day('2022-05-01', 1), day('2022-09-15', 1)];
    // At threshold 0 these are frost-free; at threshold 2 they count.
    expect(deriveFrostDates(days, 0)).toBeNull();
    expect(deriveFrostDates(days, 2)).not.toBeNull();
  });

  it('returns null for a frost-free climate', () => {
    const days = [day('2022-01-01', 8), day('2022-07-01', 18)];
    expect(deriveFrostDates(days, 0)).toBeNull();
  });

  it('takes the latest spring and earliest autumn frost within a year', () => {
    const days = [
      day('2023-03-01', -5),
      day('2023-04-05', -1), // later spring frost wins
      day('2023-11-30', -5),
      day('2023-11-01', -1), // earlier autumn frost wins
    ];
    const frost = deriveFrostDates(days, 0)!;
    expect(frost.lastFrost).toBe('04-05');
    expect(frost.firstFrost).toBe('11-01');
  });
});

describe('deriveNormals', () => {
  it('averages tMin/tMax/rain per day-of-year across years', () => {
    const days = [
      day('2020-01-01', 0, 10, 2),
      day('2021-01-01', 4, 14, 6), // same DOY, next year
      day('2020-06-01', 12, 22, 0),
    ];
    const normals = deriveNormals(days);
    const jan1 = normals.find((n) => n.doy === 1)!;
    expect(jan1.tMinC).toBe(2); // (0 + 4) / 2
    expect(jan1.tMaxC).toBe(12); // (10 + 14) / 2
    expect(jan1.rainMm).toBe(4); // (2 + 6) / 2
  });

  it('omits days-of-year with no observations and stays sorted', () => {
    const normals = deriveNormals([day('2020-01-01', 0), day('2020-12-31', -2)]);
    // Dates are re-expressed in a non-leap canonical year, so Dec 31 is DOY 365.
    expect(normals.map((n) => n.doy)).toEqual([1, 365]);
  });

  it('is empty for empty input', () => {
    expect(deriveNormals([])).toEqual([]);
  });
});

// Property-based invariants (PLAN.md §4c; TESTING.md). Generate plausible histories
// and pin the guarantees the rest of the app relies on.
describe('climate invariants (property-based)', () => {
  const isoDate = fc
    .date({ min: new Date('2015-01-01'), max: new Date('2025-12-31'), noInvalidDate: true })
    .map((d) => d.toISOString().slice(0, 10));
  const temp = fc.integer({ min: -30, max: 45 });
  const weatherDay = fc.record({
    date: isoDate,
    tMinC: temp,
    tMaxC: temp,
    rainMm: fc.double({ min: 0, max: 80, noNaN: true }),
  });

  it('normals never invent a day-of-year outside 1–366 and stay sorted', () => {
    fc.assert(
      fc.property(fc.array(weatherDay, { maxLength: 200 }), (days) => {
        const normals = deriveNormals(days);
        let prev = 0;
        for (const n of normals) {
          expect(n.doy).toBeGreaterThanOrEqual(1);
          expect(n.doy).toBeLessThanOrEqual(366);
          expect(n.doy).toBeGreaterThan(prev); // strictly increasing => unique & sorted
          prev = n.doy;
        }
      }),
    );
  });

  it('each normal lies within the observed min/max for its day-of-year', () => {
    fc.assert(
      fc.property(fc.array(weatherDay, { minLength: 1, maxLength: 200 }), (days) => {
        const normals = deriveNormals(days);
        for (const n of normals) {
          const sameDoy = days.filter((d) => {
            // Mirror the module: re-express in a non-leap canonical year, then DOY.
            const date = new Date(d.date + 'T00:00:00Z');
            const canon = Date.UTC(2001, date.getUTCMonth(), date.getUTCDate());
            const start = Date.UTC(2001, 0, 1);
            const doy = Math.floor((canon - start) / 86_400_000) + 1;
            return doy === n.doy;
          });
          const minObserved = Math.min(...sameDoy.map((d) => d.tMinC));
          const maxObserved = Math.max(...sameDoy.map((d) => d.tMinC));
          expect(n.tMinC).toBeGreaterThanOrEqual(minObserved - 1e-9);
          expect(n.tMinC).toBeLessThanOrEqual(maxObserved + 1e-9);
        }
      }),
    );
  });

  it('frost dates are either null or valid MM-DD strings', () => {
    fc.assert(
      fc.property(fc.array(weatherDay, { maxLength: 200 }), (days) => {
        const frost = deriveFrostDates(days, 0);
        if (frost === null) return;
        for (const mmdd of [frost.lastFrost, frost.firstFrost]) {
          expect(mmdd).toMatch(/^\d{2}-\d{2}$/);
          const [mm, dd] = mmdd.split('-').map(Number);
          expect(mm).toBeGreaterThanOrEqual(1);
          expect(mm).toBeLessThanOrEqual(12);
          expect(dd).toBeGreaterThanOrEqual(1);
          expect(dd).toBeLessThanOrEqual(31);
        }
      }),
    );
  });
});
