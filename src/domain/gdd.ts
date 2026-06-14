// Growing degree days — the heat-accumulation core of the digital twin (PLAN.md §5).
// Pure functions over daily temperatures; no UI or storage imports.

export interface DayTemp {
  tMinC: number;
  tMaxC: number;
}

/**
 * Growing degree days contributed by a single day for a crop with the given base
 * temperature: `max(0, min(mean, maxTempC) - base)` using the simple average method.
 *
 * The optional `maxTempC` upper cap stops a heatwave over-accumulating heat past the
 * point where the crop stops developing faster (PLAN.md §5.1). When omitted, the mean
 * is uncapped.
 */
export function dailyGdd(
  tMinC: number,
  tMaxC: number,
  baseTempC: number,
  maxTempC?: number,
): number {
  let mean = (tMinC + tMaxC) / 2;
  if (maxTempC !== undefined) mean = Math.min(mean, maxTempC);
  return Math.max(0, mean - baseTempC);
}

/** Accumulated GDD over a series of days for a crop's base temperature. */
export function accumulateGdd(days: DayTemp[], baseTempC: number, maxTempC?: number): number {
  return days.reduce((sum, d) => sum + dailyGdd(d.tMinC, d.tMaxC, baseTempC, maxTempC), 0);
}
