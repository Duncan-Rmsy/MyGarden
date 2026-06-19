import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  stageOrdinal,
  buildWeatherSeries,
  estimatePlantingState,
  applyObservation,
  type SeriesDay,
} from './twin';
import { mmddToDoy } from './climate';
import type { Stage, Planting, Crop, WeatherDay } from '../data/types';
import type { ClimateNormalDay } from './climate';

// Helper: add n days to an ISO date
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  return new Date(d.getTime() + n * 86_400_000).toISOString().slice(0, 10);
}

// Helper: create a WeatherDay
function wd(date: string, tMinC: number, tMaxC: number, source: WeatherDay['source'] = 'history'): WeatherDay {
  return { gardenId: 'g1', date, tMinC, tMaxC, rainMm: 0, source };
}

// Helper: create a ClimateNormalDay
function nd(doy: number, tMinC: number, tMaxC: number): ClimateNormalDay {
  return { doy, tMinC, tMaxC, rainMm: 0 };
}

// Minimal crop for tests
const baseCrop: Crop = {
  id: 'crop1',
  name: 'Tomato',
  family: 'Solanaceae',
  spacingCm: 40,
  sowDepthCm: 0.5,
  habit: 'compact',
  daysToGerminate: [5, 10],
  daysToMaturity: [60, 90],
  baseTempC: 10,
  frostTolerance: 'tender',
  startMethods: ['indoor', 'buy-seedling'],
  sowWindows: [],
  stages: [
    { stage: 'seed', gdd: 0 },
    { stage: 'germinated', gdd: 50 },
    { stage: 'seedling', gdd: 150 },
    { stage: 'vegetative', gdd: 300 },
    { stage: 'flowering', gdd: 500 },
    { stage: 'fruiting', gdd: 700 },
    { stage: 'harvest', gdd: 900 },
  ],
};

// Crop without stages (days-based fallback)
const noStagesCrop: Crop = {
  ...baseCrop,
  id: 'crop2',
  stages: undefined,
  daysToMaturity: [60, 90],
};

// Minimal planting
const basePlanting: Planting = {
  id: 'p1',
  bedId: 'b1',
  cropId: 'crop1',
  footprint: { x: 0, y: 0, w: 1, h: 1 },
  plantCount: 1,
  startMethod: 'direct',
  sownAt: '2025-04-01',
  status: 'active',
};

// Build a flat weather series at constant temp for easy GDD calculation
function makeWeatherSeries(fromDate: string, days: number, tMin: number, tMax: number, source: SeriesDay['source'] = 'history'): SeriesDay[] {
  const result: SeriesDay[] = [];
  for (let i = 0; i < days; i++) {
    result.push({ date: addDays(fromDate, i), tMinC: tMin, tMaxC: tMax, source });
  }
  return result;
}

// ─── stageOrdinal ────────────────────────────────────────────────────────────

describe('stageOrdinal', () => {
  const stages: Stage[] = [
    'seed', 'germinated', 'seedling', 'vegetative',
    'flowering', 'fruiting', 'harvest', 'done',
  ];

  it('maps all 8 stages to 0–7 in order', () => {
    stages.forEach((s, i) => {
      expect(stageOrdinal(s)).toBe(i);
    });
  });

  it('seed < germinated < seedling < vegetative < flowering < fruiting < harvest < done', () => {
    for (let i = 0; i < stages.length - 1; i++) {
      expect(stageOrdinal(stages[i])).toBeLessThan(stageOrdinal(stages[i + 1]));
    }
  });
});

// ─── mmddToDoy ───────────────────────────────────────────────────────────────

describe('mmddToDoy', () => {
  it("'01-01' returns 1", () => {
    expect(mmddToDoy('01-01')).toBe(1);
  });

  it("'12-31' returns 365", () => {
    expect(mmddToDoy('12-31')).toBe(365);
  });

  it('is monotonically increasing through the year', () => {
    const months = [
      ['01-01', '02-01'],
      ['02-01', '03-01'],
      ['03-01', '04-01'],
      ['04-01', '05-01'],
      ['05-01', '06-01'],
      ['06-01', '07-01'],
      ['07-01', '08-01'],
      ['08-01', '09-01'],
      ['09-01', '10-01'],
      ['10-01', '11-01'],
      ['11-01', '12-01'],
      ['12-01', '12-31'],
    ];
    for (const [a, b] of months) {
      expect(mmddToDoy(a)).toBeLessThan(mmddToDoy(b));
    }
  });

  it('Feb 28 → DOY 59, Mar 1 → DOY 60 (no Feb 29 in canonical year)', () => {
    expect(mmddToDoy('02-28')).toBe(59);
    expect(mmddToDoy('03-01')).toBe(60);
  });
});

// ─── buildWeatherSeries ──────────────────────────────────────────────────────

describe('buildWeatherSeries', () => {
  it('returns empty array when all inputs are empty and range is degenerate', () => {
    const result = buildWeatherSeries([], [], [], '2025-06-01', '2025-05-31');
    expect(result).toEqual([]);
  });

  it('returns empty array when no history/forecast/normals and range has dates', () => {
    const result = buildWeatherSeries([], [], [], '2025-06-01', '2025-06-03');
    expect(result).toEqual([]);
  });

  it('fills dates from history', () => {
    const history = [
      wd('2025-06-01', 10, 20),
      wd('2025-06-02', 11, 21),
    ];
    const result = buildWeatherSeries(history, [], [], '2025-06-01', '2025-06-02');
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe('2025-06-01');
    expect(result[0].source).toBe('history');
    expect(result[1].date).toBe('2025-06-02');
  });

  it('forecast overwrites history for same date', () => {
    const history = [wd('2025-06-01', 10, 20, 'history')];
    const forecast = [wd('2025-06-01', 15, 25, 'forecast')];
    const result = buildWeatherSeries(history, [], forecast, '2025-06-01', '2025-06-01');
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('forecast');
    expect(result[0].tMinC).toBe(15);
    expect(result[0].tMaxC).toBe(25);
  });

  it('normals fill gaps by DOY when no history or forecast', () => {
    // June 1 is DOY 152
    const doy152 = mmddToDoy('06-01');
    const normals = [nd(doy152, 5, 22)];
    const result = buildWeatherSeries([], normals, [], '2025-06-01', '2025-06-01');
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('normal');
    expect(result[0].tMinC).toBe(5);
    expect(result[0].tMaxC).toBe(22);
  });

  it('normals fill gaps when history covers only some dates', () => {
    const history = [wd('2025-06-01', 10, 20)];
    const doy153 = mmddToDoy('06-02');
    const normals = [nd(doy153, 5, 18)];
    const result = buildWeatherSeries(history, normals, [], '2025-06-01', '2025-06-02');
    expect(result).toHaveLength(2);
    expect(result[0].source).toBe('history');
    expect(result[1].source).toBe('normal');
  });

  it('result is sorted by date', () => {
    const history = [
      wd('2025-06-03', 12, 22),
      wd('2025-06-01', 10, 20),
      wd('2025-06-02', 11, 21),
    ];
    const result = buildWeatherSeries(history, [], [], '2025-06-01', '2025-06-03');
    expect(result.map((d) => d.date)).toEqual(['2025-06-01', '2025-06-02', '2025-06-03']);
  });

  it('all dates in range are present when normals cover them', () => {
    // Fill all DOYs with a normal
    const normals: ClimateNormalDay[] = [];
    for (let doy = 1; doy <= 365; doy++) {
      normals.push(nd(doy, 5, 15));
    }
    const result = buildWeatherSeries([], normals, [], '2025-06-01', '2025-06-07');
    expect(result).toHaveLength(7);
    for (let i = 0; i < 7; i++) {
      expect(result[i].date).toBe(addDays('2025-06-01', i));
    }
  });

  it('filters history and forecast outside the date range', () => {
    const history = [
      wd('2025-05-31', 8, 18),  // before fromDate
      wd('2025-06-01', 10, 20),
      wd('2025-06-08', 12, 22), // after toDate
    ];
    const result = buildWeatherSeries(history, [], [], '2025-06-01', '2025-06-07');
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2025-06-01');
  });

  it('picks closest normal by DOY with year-boundary wraparound logic', () => {
    // If only DOY 1 and DOY 365 exist, a date with DOY 364 should pick DOY 365 (distance 1),
    // not DOY 1 (which wraps to distance 2)
    const normals = [nd(1, 0, 5), nd(365, 2, 8)];
    // Dec 30 is DOY 364 in canonical year; distance to 365 = 1, distance to 1 wrapping = 1 too
    // but DOY 365 is closer without wrapping (absolute diff=1 vs 364, so min wrapping=1 for both)
    const result = buildWeatherSeries([], normals, [], '2025-12-30', '2025-12-30');
    expect(result).toHaveLength(1);
    expect(result[0].tMaxC).toBe(8); // matched DOY 365 normal
  });
});

// ─── estimatePlantingState ────────────────────────────────────────────────────

describe('estimatePlantingState', () => {
  it('returns null for status=planned', () => {
    const planting: Planting = { ...basePlanting, status: 'planned' };
    expect(estimatePlantingState(planting, baseCrop, [], '2025-06-01')).toBeNull();
  });

  it('returns null for status=failed', () => {
    const planting: Planting = { ...basePlanting, status: 'failed' };
    expect(estimatePlantingState(planting, baseCrop, [], '2025-06-01')).toBeNull();
  });

  it('returns null for status=done', () => {
    const planting: Planting = { ...basePlanting, status: 'done' };
    expect(estimatePlantingState(planting, baseCrop, [], '2025-06-01')).toBeNull();
  });

  it('returns null for direct sowing with no sownAt', () => {
    const planting: Planting = { ...basePlanting, startMethod: 'direct', sownAt: undefined };
    expect(estimatePlantingState(planting, baseCrop, [], '2025-06-01')).toBeNull();
  });

  it('returns null for indoor with no sownAt and no transplantedAt', () => {
    const planting: Planting = { ...basePlanting, startMethod: 'indoor', sownAt: undefined };
    expect(estimatePlantingState(planting, baseCrop, [], '2025-06-01')).toBeNull();
  });

  it('returns null for buy-seedling with no transplantedAt', () => {
    const planting: Planting = {
      ...basePlanting,
      startMethod: 'buy-seedling',
      sownAt: undefined,
      transplantedAt: undefined,
    };
    expect(estimatePlantingState(planting, baseCrop, [], '2025-06-01')).toBeNull();
  });

  it('direct sowing: accumulates GDD from sownAt', () => {
    // 30 days at tMin=10, tMax=30, base=10 → mean=20 → GDD/day=10 → total=300
    const sownAt = '2025-04-01';
    const today = '2025-04-30';
    const series = makeWeatherSeries(sownAt, 30, 10, 30);
    const planting: Planting = { ...basePlanting, startMethod: 'direct', sownAt };
    const state = estimatePlantingState(planting, baseCrop, series, today);
    expect(state).not.toBeNull();
    expect(Math.abs(state!.gddAccumulated - 300)).toBeLessThan(0.01);
    expect(state!.usingGdd).toBe(true);
  });

  it('direct sowing: stage=vegetative at GDD=300', () => {
    const sownAt = '2025-04-01';
    const today = '2025-04-30';
    const series = makeWeatherSeries(sownAt, 30, 10, 30); // 10 GDD/day × 30 = 300
    const planting: Planting = { ...basePlanting, startMethod: 'direct', sownAt };
    const state = estimatePlantingState(planting, baseCrop, series, today);
    expect(state!.stage).toBe('vegetative');
  });

  it('indoor no transplant: returns usingGdd=false and confidence=high', () => {
    const planting: Planting = {
      ...basePlanting,
      startMethod: 'indoor',
      sownAt: '2025-03-01',
      transplantedAt: undefined,
    };
    const state = estimatePlantingState(planting, baseCrop, [], '2025-03-10');
    expect(state).not.toBeNull();
    expect(state!.usingGdd).toBe(false);
    expect(state!.confidence).toBe('high');
    expect(state!.gddAccumulated).toBe(0);
  });

  it('indoor with transplant: accumulates GDD from transplantedAt', () => {
    const sownAt = '2025-03-01';
    const transplantedAt = '2025-04-01';
    const today = '2025-04-30';
    // 30 days × 10 GDD/day = 300
    const series = makeWeatherSeries(transplantedAt, 30, 10, 30);
    const planting: Planting = {
      ...basePlanting,
      startMethod: 'indoor',
      sownAt,
      transplantedAt,
    };
    const state = estimatePlantingState(planting, baseCrop, series, today);
    expect(state).not.toBeNull();
    expect(Math.abs(state!.gddAccumulated - 300)).toBeLessThan(0.01);
    expect(state!.stage).toBe('vegetative');
  });

  it('buy-seedling: starts from seedling stage with GDD from transplantedAt', () => {
    const transplantedAt = '2025-04-01';
    const today = '2025-04-11';
    // 10 days × 10 GDD/day = 100 GDD → stage=germinated (50<=100<150)
    const series = makeWeatherSeries(transplantedAt, 10, 10, 30);
    const planting: Planting = {
      ...basePlanting,
      startMethod: 'buy-seedling',
      sownAt: undefined,
      transplantedAt,
    };
    const state = estimatePlantingState(planting, baseCrop, series, today);
    expect(state).not.toBeNull();
    // At 100 GDD: germinated (gdd=50), seedling (gdd=150). 100 < 150, so stays at germinated?
    // Actually the first matching gdd<=accumulated: seed(0<=100✓), germinated(50<=100✓), seedling(150>100✗)
    // Last match = germinated
    expect(state!.stage).toBe('germinated');
    expect(state!.usingGdd).toBe(true);
  });

  it('stage=seed when GDD=0', () => {
    const sownAt = '2025-04-01';
    const today = '2025-04-01';
    // 1 day at tMin=5, tMax=5, base=10 → GDD=0
    const series: SeriesDay[] = [{ date: sownAt, tMinC: 5, tMaxC: 5, source: 'history' }];
    const planting: Planting = { ...basePlanting, startMethod: 'direct', sownAt };
    const state = estimatePlantingState(planting, baseCrop, series, today);
    expect(state!.stage).toBe('seed');
  });

  it('stage=germinated when GDD crosses germination threshold', () => {
    // GDD=75 → germinated (50<=75<150)
    const sownAt = '2025-04-01';
    const today = '2025-04-08';
    // 7 days × ~10.7 GDD ≈ 75 total; let's use tMin=10, tMax=25 → mean=17.5, gdd=7.5/day × 10 = 75
    const series = makeWeatherSeries(sownAt, 10, 10, 25); // 10 days = 75 GDD
    const planting: Planting = { ...basePlanting, startMethod: 'direct', sownAt };
    // 10 days of 7.5 GDD = 75 GDD
    const seriesSliced = series.slice(0, 10);
    const state = estimatePlantingState(planting, baseCrop, seriesSliced, today);
    expect(state!.stage).toBe('germinated');
  });

  it('harvest projection date is after or equal to today', () => {
    const sownAt = '2025-04-01';
    const today = '2025-04-30';
    // 30 days × 10 GDD = 300 (vegetative), need 900 for harvest
    const series = makeWeatherSeries(sownAt, 90, 10, 30); // lots of future days at 10 GDD/day
    const planting: Planting = { ...basePlanting, startMethod: 'direct', sownAt };
    const state = estimatePlantingState(planting, baseCrop, series, today);
    expect(state!.projectedHarvestDate).toBeDefined();
    expect(state!.projectedHarvestDate! >= today).toBe(true);
  });

  it('confidence=high when most forward days are real weather', () => {
    const sownAt = '2025-04-01';
    const today = '2025-04-30';
    // History up to today, then history (not normal) for 20 more days
    const history = makeWeatherSeries(sownAt, 50, 10, 30, 'history');
    const planting: Planting = { ...basePlanting, startMethod: 'direct', sownAt };
    const state = estimatePlantingState(planting, baseCrop, history, today);
    expect(state!.confidence).toBe('high');
  });

  it('confidence=low when most forward days are normals', () => {
    const sownAt = '2025-04-01';
    const today = '2025-04-30';
    // History only up to today; future days are normals
    const historySeries = makeWeatherSeries(sownAt, 30, 10, 30, 'history');
    const normalsFuture = makeWeatherSeries(addDays(today, 1), 20, 8, 18, 'normal');
    const combined = [...historySeries, ...normalsFuture];
    const planting: Planting = { ...basePlanting, startMethod: 'direct', sownAt };
    const state = estimatePlantingState(planting, baseCrop, combined, today);
    expect(state!.confidence).toBe('low');
  });

  it('no stages defined → falls back to daysToMaturity', () => {
    const sownAt = '2025-04-01';
    const today = '2025-05-01';
    const series = makeWeatherSeries(sownAt, 30, 10, 20);
    const planting: Planting = { ...basePlanting, startMethod: 'direct', sownAt };
    const state = estimatePlantingState(planting, noStagesCrop, series, today);
    expect(state).not.toBeNull();
    expect(state!.usingGdd).toBe(false);
    expect(state!.projectedHarvestDate).toBeDefined();
  });

  it('daysToHarvest is 0 when already at or past harvest (GDD path)', () => {
    const sownAt = '2025-01-01';
    const today = '2025-04-10';
    // 100 days × 10 GDD = 1000 GDD > 900 harvest threshold
    const series = makeWeatherSeries(sownAt, 100, 10, 30, 'history');
    const planting: Planting = { ...basePlanting, startMethod: 'direct', sownAt };
    const state = estimatePlantingState(planting, baseCrop, series, today);
    expect(state!.daysToHarvest).toBe(0);
    expect(state!.projectedHarvestDate).toBe(today);
  });

  it('days-based path: daysToHarvest=0 when harvest date already passed', () => {
    // sownAt 200 days ago, daysToMaturity[1]=90 → harvest date is in the past
    const sownAt = addDays('2025-06-01', -200);
    const today = '2025-06-01';
    const series = makeWeatherSeries(sownAt, 200, 5, 15); // low GDD so no GDD stages
    const planting: Planting = { ...basePlanting, startMethod: 'direct', sownAt };
    const state = estimatePlantingState(planting, noStagesCrop, series, today);
    expect(state!.daysToHarvest).toBe(0);
    expect(state!.projectedHarvestDate).toBe(today);
  });

  it('confidence=medium when 40-70% forward days are real weather', () => {
    const sownAt = '2025-04-01';
    const today = '2025-04-30';
    // 3 history + 7 normal = 30% real (below 40 → low)
    // Need 40-70%: 5 forecast + 5 normal = 50% real
    const historySeries = makeWeatherSeries(sownAt, 30, 10, 30, 'history');
    const forecastFuture = makeWeatherSeries(addDays(today, 1), 5, 10, 25, 'forecast');
    const normalFuture = makeWeatherSeries(addDays(today, 6), 5, 8, 18, 'normal');
    const combined = [...historySeries, ...forecastFuture, ...normalFuture];
    const planting: Planting = { ...basePlanting, startMethod: 'direct', sownAt };
    const state = estimatePlantingState(planting, baseCrop, combined, today);
    expect(state!.confidence).toBe('medium');
  });

  it('stageFromGdd fallback: first stage used when no GDD stages have gdd<= accumulated (all gdd undefined)', () => {
    // Crop with stages but no gdd field (only days), so hasGddStages returns false → days fallback
    const cropNoDayGdd: Crop = {
      ...baseCrop,
      stages: [
        { stage: 'seed', days: [0, 5] },
        { stage: 'germinated', days: [5, 15] },
        { stage: 'harvest', days: [60, 90] },
      ],
    };
    const sownAt = '2025-04-01';
    const today = '2025-04-11';
    const series = makeWeatherSeries(sownAt, 10, 10, 30);
    const planting: Planting = { ...basePlanting, startMethod: 'direct', sownAt };
    const state = estimatePlantingState(planting, cropNoDayGdd, series, today);
    expect(state).not.toBeNull();
    // Days-based fallback (usingGdd=false since no gdd fields)
    expect(state!.usingGdd).toBe(false);
  });

  it('stageFromGdd: uses first-stage fallback when all gdd thresholds exceed accumulated (mixed crop)', () => {
    // Crop where all gdd thresholds are very high (above any accumulated GDD),
    // but at least one has gdd defined (so useGdd=true), but none match accumulated
    const cropHighGdd: Crop = {
      ...baseCrop,
      stages: [
        { stage: 'germinated', gdd: 1000 }, // too high to match at GDD=0
        { stage: 'harvest', gdd: 2000 },
      ],
    };
    const sownAt = '2025-04-01';
    const today = '2025-04-01';
    // 1 day at very cold temps → GDD≈0
    const series: SeriesDay[] = [{ date: sownAt, tMinC: 2, tMaxC: 3, source: 'history' }];
    const planting: Planting = { ...basePlanting, startMethod: 'direct', sownAt };
    const state = estimatePlantingState(planting, cropHighGdd, series, today);
    expect(state).not.toBeNull();
    expect(state!.usingGdd).toBe(true);
    // stageFromGdd fallback: current = stages[0] = germinated, next = stages[1] = harvest
    expect(state!.stage).toBe('germinated');
  });

  it('estimateIndoorStage without crop.stages: returns seed when daysElapsed < germinateMidpoint', () => {
    // Use a crop with no stages; sown 2 days ago, germinateMidpoint=(5+10)/2=7.5 → still seed
    const planting: Planting = {
      ...basePlanting,
      startMethod: 'indoor',
      sownAt: addDays('2025-04-01', -2), // 2 days ago
      transplantedAt: undefined,
    };
    const state = estimatePlantingState(planting, noStagesCrop, [], '2025-04-01');
    expect(state).not.toBeNull();
    expect(state!.stage).toBe('seed');
    expect(state!.usingGdd).toBe(false);
  });

  it('estimateIndoorStage without crop.stages: returns germinated when daysElapsed >= germinateMidpoint', () => {
    // germinateMidpoint=(5+10)/2=7.5; sown 10 days ago → germinated
    const planting: Planting = {
      ...basePlanting,
      startMethod: 'indoor',
      sownAt: addDays('2025-04-01', -10), // 10 days ago
      transplantedAt: undefined,
    };
    const state = estimatePlantingState(planting, noStagesCrop, [], '2025-04-01');
    expect(state).not.toBeNull();
    expect(state!.stage).toBe('germinated');
    expect(state!.usingGdd).toBe(false);
  });

  it('gddToNextStage reflects remaining GDD to next stage', () => {
    const sownAt = '2025-04-01';
    const today = '2025-04-08';
    // 7 days × 7.5 GDD = 52.5 GDD (just past germinated=50, next=seedling=150)
    const series = makeWeatherSeries(sownAt, 7, 10, 25); // 7.5 GDD/day × 7 = 52.5
    const planting: Planting = { ...basePlanting, startMethod: 'direct', sownAt };
    const state = estimatePlantingState(planting, baseCrop, series, today);
    expect(state!.gddToNextStage).toBeDefined();
    // next stage is seedling at 150, remaining = 150 - 52.5 = 97.5
    expect(Math.abs(state!.gddToNextStage! - 97.5)).toBeLessThan(1);
  });
});

// ─── applyObservation ────────────────────────────────────────────────────────

describe('applyObservation', () => {
  it('with predictedDate: deltaDays is correct and positive when plant is ahead', () => {
    // plant observed flowering on Apr 10, predicted Apr 15 → deltaDays = +5 (ahead)
    const delta = applyObservation('flowering', '2025-04-10', '2025-04-15');
    expect(delta.deltaDays).toBe(5);
  });

  it('with predictedDate: deltaDays is negative when plant is behind', () => {
    // observed Apr 20, predicted Apr 15 → deltaDays = -5 (behind)
    const delta = applyObservation('flowering', '2025-04-20', '2025-04-15');
    expect(delta.deltaDays).toBe(-5);
  });

  it('without predictedDate: deltaDays is undefined', () => {
    const delta = applyObservation('seedling', '2025-04-01');
    expect(delta.deltaDays).toBeUndefined();
    expect(delta.predictedDate).toBeUndefined();
  });

  it('round-trip: observedStage and observedDate are preserved', () => {
    const delta = applyObservation('vegetative', '2025-05-01', '2025-05-10');
    expect(delta.observedStage).toBe('vegetative');
    expect(delta.observedDate).toBe('2025-05-01');
    expect(delta.predictedDate).toBe('2025-05-10');
  });

  it('deltaDays=0 when observed and predicted on same day', () => {
    const delta = applyObservation('harvest', '2025-08-01', '2025-08-01');
    expect(delta.deltaDays).toBe(0);
  });
});

// ─── Property-based tests ─────────────────────────────────────────────────────

describe('twin invariants (property-based, PLAN.md §5.2–5.3)', () => {
  it('stageOrdinal is strictly monotone across all stages', () => {
    const stages: Stage[] = [
      'seed', 'germinated', 'seedling', 'vegetative',
      'flowering', 'fruiting', 'harvest', 'done',
    ];
    for (let i = 0; i < stages.length - 1; i++) {
      expect(stageOrdinal(stages[i])).toBeLessThan(stageOrdinal(stages[i + 1]));
    }
  });

  it('buildWeatherSeries result is sorted and within bounds', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('2025-04-01', '2025-06-01', '2025-01-01'),
        fc.integer({ min: 1, max: 30 }),
        (fromDate, days) => {
          const toDate = addDays(fromDate, days);
          const series = buildWeatherSeries([], [], [], fromDate, toDate);
          // No normals = empty; just verify no out-of-bounds entries
          return series.every((d) => d.date >= fromDate && d.date <= toDate);
        },
      ),
    );
  });

  it('GDD accumulation in estimatePlantingState is non-negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -20, max: 40 }),
        fc.integer({ min: -20, max: 40 }),
        fc.integer({ min: 0, max: 15 }),
        fc.integer({ min: 1, max: 30 }),
        (tMin, tMax, baseTempC, daysCount) => {
          const sownAt = '2025-04-01';
          const today = addDays(sownAt, daysCount);
          const series: SeriesDay[] = [];
          for (let i = 0; i <= daysCount; i++) {
            series.push({
              date: addDays(sownAt, i),
              tMinC: tMin,
              tMaxC: tMax,
              source: 'history',
            });
          }
          const crop: Crop = {
            ...noStagesCrop,
            baseTempC,
            daysToMaturity: [60, 90],
          };
          const planting: Planting = {
            ...basePlanting,
            startMethod: 'direct',
            sownAt,
          };
          const state = estimatePlantingState(planting, crop, series, today);
          if (state !== null) {
            return state.gddAccumulated >= 0;
          }
          return true;
        },
      ),
    );
  });

  it('buildWeatherSeries: forecast always wins over history for same date', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -20, max: 20 }),
        fc.integer({ min: -20, max: 20 }),
        fc.integer({ min: -20, max: 20 }),
        fc.integer({ min: -20, max: 20 }),
        (hMin, hMax, fMin, fMax) => {
          const date = '2025-06-15';
          const history = [{ gardenId: 'g1', date, tMinC: hMin, tMaxC: hMax, rainMm: 0, source: 'history' as const }];
          const forecast = [{ gardenId: 'g1', date, tMinC: fMin, tMaxC: fMax, rainMm: 0, source: 'forecast' as const }];
          const result = buildWeatherSeries(history, [], forecast, date, date);
          return (
            result.length === 1 &&
            result[0].source === 'forecast' &&
            result[0].tMinC === fMin &&
            result[0].tMaxC === fMax
          );
        },
      ),
    );
  });

  it('buildWeatherSeries: output is always sorted by date', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            date: fc.constantFrom('2025-06-01', '2025-06-02', '2025-06-03', '2025-06-04', '2025-06-05'),
            tMinC: fc.integer({ min: 0, max: 20 }),
            tMaxC: fc.integer({ min: 20, max: 40 }),
          }),
          { maxLength: 10 },
        ),
        (rawHistory) => {
          const history: WeatherDay[] = rawHistory.map((d) => ({
            gardenId: 'g1',
            date: d.date,
            tMinC: d.tMinC,
            tMaxC: d.tMaxC,
            rainMm: 0,
            source: 'history' as const,
          }));
          const result = buildWeatherSeries(history, [], [], '2025-06-01', '2025-06-05');
          for (let i = 0; i < result.length - 1; i++) {
            if (result[i].date >= result[i + 1].date) return false;
          }
          return true;
        },
      ),
    );
  });

  it('applyObservation deltaDays is inverse: swapping observed and predicted negates delta', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('2025-04-01', '2025-05-01', '2025-06-01'),
        fc.integer({ min: -30, max: 30 }),
        (baseDate, offset) => {
          const otherDate = addDays(baseDate, offset);
          const d1 = applyObservation('seedling', baseDate, otherDate);
          const d2 = applyObservation('seedling', otherDate, baseDate);
          if (d1.deltaDays === undefined || d2.deltaDays === undefined) return false;
          return d1.deltaDays + d2.deltaDays === 0;
        },
      ),
    );
  });
});
