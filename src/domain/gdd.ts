// Growing degree days — the heat-accumulation core of the digital twin (PLAN.md §5).
// Pure functions over daily temperatures; no UI or storage imports.

export interface DayTemp {
  tMinC: number;
  tMaxC: number;
}

/**
 * Growing degree days contributed by a single day for a crop with the given base
 * temperature: `max(0, mean - base)` using the simple average method.
 */
export function dailyGdd(tMinC: number, tMaxC: number, baseTempC: number): number {
  const mean = (tMinC + tMaxC) / 2;
  return Math.max(0, mean - baseTempC);
}

/** Accumulated GDD over a series of days for a crop's base temperature. */
export function accumulateGdd(days: DayTemp[], baseTempC: number): number {
  return days.reduce((sum, d) => sum + dailyGdd(d.tMinC, d.tMaxC, baseTempC), 0);
}
