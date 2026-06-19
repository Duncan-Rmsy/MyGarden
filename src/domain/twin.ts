// Digital twin core (PLAN.md §5.2–5.3).
// Stitches weather history, normals, and forecast into a contiguous series,
// then projects stage and harvest for a planting. Pure functions — no React,
// Dexie, network, or Date.now() imports.

import type { Stage, Planting, Crop, StageDef } from '../data/types';
import { dailyGdd } from './gdd';
import { mmddToDoy, ClimateNormalDay } from './climate';
import type { WeatherDay } from '../data/types';

export const INDOOR_TEMP_C = 18; // reference temperature for documentation; indoor phase uses calendar days NOT GDD

export type TwinConfidence = 'high' | 'medium' | 'low';

export interface SeriesDay {
  date: string;         // ISO yyyy-mm-dd
  tMinC: number;
  tMaxC: number;
  source: 'history' | 'forecast' | 'normal';
}

export interface TwinState {
  stage: Stage;
  gddAccumulated: number;
  gddToNextStage?: number;
  projectedHarvestDate?: string;
  daysToHarvest?: number;
  confidence: TwinConfidence;
  usingGdd: boolean;
}

export interface ObservationDelta {
  observedStage: Stage;
  observedDate: string;
  predictedDate?: string;
  deltaDays?: number; // positive = plant is ahead; negative = behind
}

const STAGE_ORDER: Stage[] = [
  'seed',
  'germinated',
  'seedling',
  'vegetative',
  'flowering',
  'fruiting',
  'harvest',
  'done',
];

/** Maps Stage to a 0-based index. */
export function stageOrdinal(stage: Stage): number {
  return STAGE_ORDER.indexOf(stage);
}

/**
 * Stitches history, forecast, and normals into a contiguous daily series
 * covering [fromDate, toDate] inclusive.
 *
 * Priority per date slot: forecast > history > normal (by DOY).
 */
export function buildWeatherSeries(
  history: WeatherDay[],
  normals: ClimateNormalDay[],
  forecast: WeatherDay[],
  fromDate: string,
  toDate: string,
): SeriesDay[] {
  const map = new Map<string, SeriesDay>();

  // Step 1: fill from history
  for (const d of history) {
    if (d.date >= fromDate && d.date <= toDate) {
      map.set(d.date, { date: d.date, tMinC: d.tMinC, tMaxC: d.tMaxC, source: 'history' });
    }
  }

  // Step 2: overwrite with forecast (forecast > history)
  for (const d of forecast) {
    if (d.date >= fromDate && d.date <= toDate) {
      map.set(d.date, { date: d.date, tMinC: d.tMinC, tMaxC: d.tMaxC, source: 'forecast' });
    }
  }

  // Step 3: fill remaining dates from normals by DOY
  if (normals.length > 0) {
    let cursor = new Date(fromDate + 'T00:00:00Z');
    const end = new Date(toDate + 'T00:00:00Z');

    while (cursor <= end) {
      const dateStr = cursor.toISOString().slice(0, 10);
      if (!map.has(dateStr)) {
        // Get DOY for this date using mmddToDoy on the MM-DD slice
        const mmdd = dateStr.slice(5); // 'MM-DD'
        const targetDoy = mmddToDoy(mmdd);

        // Find closest normal by DOY with wraparound at 365
        let best: ClimateNormalDay | null = null;
        let bestDist = Infinity;
        for (const n of normals) {
          const dist = Math.min(Math.abs(n.doy - targetDoy), 365 - Math.abs(n.doy - targetDoy));
          if (dist < bestDist) {
            bestDist = dist;
            best = n;
          }
        }

        if (best !== null) {
          map.set(dateStr, {
            date: dateStr,
            tMinC: best.tMinC,
            tMaxC: best.tMaxC,
            source: 'normal',
          });
        }
      }
      cursor = new Date(cursor.getTime() + 86_400_000);
    }
  }

  // Return sorted by date
  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Private helper: estimate indoor stage from calendar days elapsed.
 */
function estimateIndoorStage(
  crop: Crop,
  sownAt: string,
  today: string,
): { stage: Stage; daysElapsed: number } {
  const sownMs = new Date(sownAt + 'T00:00:00Z').getTime();
  const todayMs = new Date(today + 'T00:00:00Z').getTime();
  const daysElapsed = Math.max(0, Math.floor((todayMs - sownMs) / 86_400_000));

  if (crop.stages && crop.stages.length > 0) {
    // Walk through stages using `days` midpoints
    let cumulativeDays = 0;
    let currentStage: Stage = crop.stages[0].stage;
    for (const stageDef of crop.stages) {
      if (stageDef.days) {
        const midpoint = (stageDef.days[0] + stageDef.days[1]) / 2;
        cumulativeDays += midpoint;
        if (daysElapsed < cumulativeDays) {
          return { stage: currentStage, daysElapsed };
        }
        currentStage = stageDef.stage;
      }
    }
    return { stage: currentStage, daysElapsed };
  }

  // Fallback: use daysToGerminate
  const germinateMidpoint = (crop.daysToGerminate[0] + crop.daysToGerminate[1]) / 2;
  if (daysElapsed < germinateMidpoint) {
    return { stage: 'seed', daysElapsed };
  }
  return { stage: 'germinated', daysElapsed };
}

/** Days from date a to date b (b - a; positive means b is after a). */
function dateDiffDays(a: string, b: string): number {
  const aMs = new Date(a + 'T00:00:00Z').getTime();
  const bMs = new Date(b + 'T00:00:00Z').getTime();
  return Math.round((bMs - aMs) / 86_400_000);
}

/** Add n days to an ISO date string. */
function addDaysToDate(iso: string, n: number): string {
  const ms = new Date(iso + 'T00:00:00Z').getTime();
  return new Date(ms + n * 86_400_000).toISOString().slice(0, 10);
}

/** Determine whether any StageDef in an array has a gdd field. */
function hasGddStages(stages: StageDef[]): boolean {
  return stages.some((s) => s.gdd !== undefined);
}

/** Determine current stage from accumulated GDD using crop.stages. */
function stageFromGdd(stages: StageDef[], gddAccumulated: number): { current: StageDef | null; next: StageDef | null } {
  let current: StageDef | null = null;
  let next: StageDef | null = null;

  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    if (s.gdd !== undefined && s.gdd <= gddAccumulated) {
      current = s;
      next = stages[i + 1] ?? null;
    }
  }

  // If no gdd stage matched, use the first stage as starting point
  if (current === null && stages.length > 0) {
    current = stages[0];
    next = stages[1] ?? null;
  }

  return { current, next };
}

/** Proportional stage from days elapsed vs daysToMaturity. */
function stageFromDays(daysElapsed: number, daysToMaturity: [number, number]): Stage {
  if (daysElapsed >= daysToMaturity[1]) return 'harvest';
  if (daysElapsed >= daysToMaturity[0]) return 'fruiting';

  const progressionStages: Stage[] = ['seed', 'germinated', 'seedling', 'vegetative', 'flowering'];
  const ratio = daysElapsed / daysToMaturity[0];
  const idx = Math.min(
    progressionStages.length - 1,
    Math.floor(ratio * progressionStages.length),
  );
  return progressionStages[idx];
}

/**
 * Estimate the current stage and harvest projection for a planting.
 * Returns null if the planting is not in an active outdoor phase.
 */
export function estimatePlantingState(
  planting: Planting,
  crop: Crop,
  weatherSeries: SeriesDay[],
  today: string,
): TwinState | null {
  // Return null for terminal/planned statuses
  if (
    planting.status === 'planned' ||
    planting.status === 'failed' ||
    planting.status === 'done'
  ) {
    return null;
  }

  const { startMethod, sownAt, transplantedAt } = planting;

  // Null checks per start method
  if ((startMethod === 'direct' || startMethod === 'indoor') && !sownAt) {
    return null;
  }
  if (startMethod === 'buy-seedling' && !transplantedAt) {
    return null;
  }

  // Case C: indoor, no transplant yet — use calendar days
  if (startMethod === 'indoor' && !transplantedAt) {
    const { stage, daysElapsed } = estimateIndoorStage(crop, sownAt!, today);
    return {
      stage,
      gddAccumulated: 0,
      confidence: 'high',
      usingGdd: false,
      daysToHarvest: crop.daysToMaturity
        ? Math.max(0, crop.daysToMaturity[1] - daysElapsed)
        : undefined,
    };
  }

  // Determine anchor date and starting stage
  let anchor: string;
  let startingStage: Stage;

  if (startMethod === 'buy-seedling') {
    anchor = transplantedAt!;
    startingStage = 'seedling';
  } else if (startMethod === 'indoor' && transplantedAt) {
    // Case B: indoor, transplanted
    anchor = transplantedAt;
    startingStage = 'seedling';
  } else {
    // Case D: direct
    anchor = sownAt!;
    startingStage = 'seed';
  }

  // Accumulate GDD from anchor to today (inclusive)
  const activeDays = weatherSeries.filter(
    (d) => d.date >= anchor && d.date <= today,
  );

  let gddAccumulated = 0;
  let daysElapsed = 0;
  for (const d of activeDays) {
    gddAccumulated += dailyGdd(d.tMinC, d.tMaxC, crop.baseTempC, crop.maxTempC);
    daysElapsed++;
  }

  const useGdd =
    Boolean(crop.stages && crop.stages.length > 0) && hasGddStages(crop.stages ?? []);

  let currentStage: Stage = startingStage;
  let gddToNextStage: number | undefined;
  let projectedHarvestDate: string | undefined;
  let daysToHarvest: number | undefined;

  if (useGdd && crop.stages && crop.stages.length > 0) {
    // Determine current stage from GDD
    const { current, next } = stageFromGdd(crop.stages, gddAccumulated);

    if (current) {
      currentStage = current.stage;
    }

    if (next?.gdd !== undefined) {
      gddToNextStage = Math.max(0, next.gdd - gddAccumulated);
    }

    // Find harvest GDD threshold
    const harvestStageDef = crop.stages.find((s) => s.stage === 'harvest');
    if (harvestStageDef?.gdd !== undefined) {
      const harvestGdd = harvestStageDef.gdd;
      if (gddAccumulated >= harvestGdd) {
        projectedHarvestDate = today;
        daysToHarvest = 0;
      } else {
        // Project forward in weather series
        let runningGdd = gddAccumulated;
        const futureDays = weatherSeries.filter((d) => d.date > today);
        let found = false;
        for (const d of futureDays) {
          runningGdd += dailyGdd(d.tMinC, d.tMaxC, crop.baseTempC, crop.maxTempC);
          if (runningGdd >= harvestGdd) {
            projectedHarvestDate = d.date;
            daysToHarvest = dateDiffDays(today, d.date);
            found = true;
            break;
          }
        }
        if (!found && futureDays.length > 0) {
          // Estimate beyond series: extrapolate using average GDD from recent days
          const recentDays = activeDays.slice(-7);
          if (recentDays.length > 0) {
            const avgDailyGdd =
              recentDays.reduce(
                (sum, d) => sum + dailyGdd(d.tMinC, d.tMaxC, crop.baseTempC, crop.maxTempC),
                0,
              ) / recentDays.length;
            const remainingGdd = harvestGdd - runningGdd;
            if (avgDailyGdd > 0) {
              const extraDays = Math.ceil(remainingGdd / avgDailyGdd);
              const lastSeriesDate =
                futureDays.length > 0
                  ? futureDays[futureDays.length - 1].date
                  : today;
              projectedHarvestDate = addDaysToDate(lastSeriesDate, extraDays);
              daysToHarvest = dateDiffDays(today, projectedHarvestDate);
            }
          }
        }
      }
    }
  } else {
    // Fallback: days-based
    currentStage = stageFromDays(daysElapsed, crop.daysToMaturity as [number, number]);

    // Project harvest using daysToMaturity[1] from anchor
    const harvestDaysFromAnchor = crop.daysToMaturity[1];
    const harvestDate = addDaysToDate(anchor, harvestDaysFromAnchor);
    if (harvestDate >= today) {
      projectedHarvestDate = harvestDate;
      daysToHarvest = dateDiffDays(today, harvestDate);
    } else {
      projectedHarvestDate = today;
      daysToHarvest = 0;
    }
  }

  // Compute confidence based on proportion of real weather in projection window
  const forwardDays = weatherSeries.filter((d) => d.date > today);
  let confidence: TwinConfidence = 'high';
  if (forwardDays.length > 0) {
    const realDays = forwardDays.filter(
      (d) => d.source === 'history' || d.source === 'forecast',
    ).length;
    const ratio = realDays / forwardDays.length;
    if (ratio >= 0.7) {
      confidence = 'high';
    } else if (ratio >= 0.4) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }
  }

  return {
    stage: currentStage,
    gddAccumulated,
    gddToNextStage,
    projectedHarvestDate,
    daysToHarvest,
    confidence,
    usingGdd: useGdd,
  };
}

/**
 * Build an ObservationDelta from an observed stage and date vs a prediction.
 * deltaDays is positive when the plant is ahead of prediction.
 */
export function applyObservation(
  observedStage: Stage,
  observedDate: string,
  predictedDate?: string,
): ObservationDelta {
  return {
    observedStage,
    observedDate,
    predictedDate,
    deltaDays: predictedDate ? dateDiffDays(observedDate, predictedDate) : undefined,
  };
}
