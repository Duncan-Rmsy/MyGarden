// Climate derivation (PLAN.md §4c) — pure functions over daily weather history.
// One historical pull is used three ways: frost dates anchor the calendar, normals
// let the twin project past the forecast, and both carry confidence. No UI or storage
// imports; heavily unit-tested.
//
// Northern-hemisphere assumption: the spring frost falls in the first half of the
// calendar year and the autumn frost in the second, which holds for the temperate/UK
// gardens v1 targets. Day-of-year is used throughout (1–366); Feb 29 shifts later DOYs
// by one in leap years, an acceptable smear for climatology.

/** Minimal shape this module needs from a day of weather — WeatherDay satisfies it. */
export interface DailyWeather {
  date: string; // ISO yyyy-mm-dd
  tMinC: number;
  tMaxC: number;
  rainMm: number;
}

/** Derived frost dates, as MM-DD strings anchored to a year at runtime. */
export interface FrostDates {
  lastFrost: string; // average last spring frost, e.g. '04-15'
  firstFrost: string; // average first autumn frost, e.g. '10-28'
}

/** A single day-of-year climate normal (averaged across all years of history). */
export interface ClimateNormalDay {
  doy: number; // 1–366
  tMinC: number;
  tMaxC: number;
  rainMm: number;
}

const MS_PER_DAY = 86_400_000;
// A fixed non-leap canonical year. Every date is re-expressed here before its day-of-year
// is computed, so the leap-ness of the source year can't shift an averaged date by a day.
// A Feb 29 source date rolls to Mar 1, an acceptable smear for frost climatology.
const CANON_YEAR = 2001;

/** Day-of-year (1-based) for an ISO date, re-expressed in the canonical non-leap year. */
export function canonicalDoy(iso: string): number {
  const d = new Date(iso + 'T00:00:00Z');
  const canon = Date.UTC(CANON_YEAR, d.getUTCMonth(), d.getUTCDate());
  const start = Date.UTC(CANON_YEAR, 0, 1);
  return Math.floor((canon - start) / MS_PER_DAY) + 1;
}

/**
 * Convert a 'MM-DD' sentinel string (as stored in normals rows) to day-of-year
 * in the canonical non-leap year.
 */
export function mmddToDoy(mmdd: string): number {
  return canonicalDoy(`${CANON_YEAR}-${mmdd}`);
}

/** Convert a (possibly fractional) day-of-year to an MM-DD string in the canonical year. */
export function doyToMMDD(doy: number): string {
  const clamped = Math.min(365, Math.max(1, Math.round(doy)));
  const d = new Date(Date.UTC(CANON_YEAR, 0, 1) + (clamped - 1) * MS_PER_DAY);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

/** Calendar year of an ISO date string. */
function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Average last-spring and first-autumn frost dates from multi-year history (§4c).
 *
 * For each year, the last spring frost is the latest first-half day with `tMinC` below
 * the threshold, and the first autumn frost is the earliest second-half day below it.
 * The per-year dates are averaged (by day-of-year) across the years that actually had a
 * frost. Returns `null` for a frost-free climate where no year crosses the threshold —
 * the UI then offers editable blanks rather than a fabricated date.
 */
export function deriveFrostDates(
  days: DailyWeather[],
  thresholdC = 0,
): FrostDates | null {
  const lastSpringByYear = new Map<number, number>(); // year -> max spring DOY below threshold
  const firstAutumnByYear = new Map<number, number>(); // year -> min autumn DOY below threshold

  for (const day of days) {
    if (day.tMinC >= thresholdC) continue;
    const year = yearOf(day.date);
    const doy = canonicalDoy(day.date);
    const d = new Date(day.date + 'T00:00:00Z');
    const firstHalf = d.getUTCMonth() <= 5; // Jan–Jun

    if (firstHalf) {
      const prev = lastSpringByYear.get(year);
      if (prev === undefined || doy > prev) lastSpringByYear.set(year, doy);
    } else {
      const prev = firstAutumnByYear.get(year);
      if (prev === undefined || doy < prev) firstAutumnByYear.set(year, doy);
    }
  }

  const springDoys = [...lastSpringByYear.values()];
  const autumnDoys = [...firstAutumnByYear.values()];
  if (springDoys.length === 0 && autumnDoys.length === 0) return null;

  return {
    // If only one season has data, reuse it so we still anchor the calendar; the user
    // can edit either field afterwards.
    lastFrost: doyToMMDD(springDoys.length ? mean(springDoys) : mean(autumnDoys)),
    firstFrost: doyToMMDD(autumnDoys.length ? mean(autumnDoys) : mean(springDoys)),
  };
}

/**
 * Per-garden climate normals: a day-of-year average tMin/tMax/rain curve (§4c). These
 * feed the twin's forward projection past the 16-day forecast. Day-of-year slots with
 * no observations are omitted, so the result has up to 366 entries sorted by DOY.
 */
export function deriveNormals(days: DailyWeather[]): ClimateNormalDay[] {
  const buckets = new Map<number, { tMin: number[]; tMax: number[]; rain: number[] }>();

  for (const day of days) {
    const doy = canonicalDoy(day.date);
    let bucket = buckets.get(doy);
    if (!bucket) {
      bucket = { tMin: [], tMax: [], rain: [] };
      buckets.set(doy, bucket);
    }
    bucket.tMin.push(day.tMinC);
    bucket.tMax.push(day.tMaxC);
    bucket.rain.push(day.rainMm);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([doy, b]) => ({
      doy,
      tMinC: mean(b.tMin),
      tMaxC: mean(b.tMax),
      rainMm: mean(b.rain),
    }));
}
