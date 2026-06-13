// Domain types for MyGarden. These mirror the data model in PLAN.md (§4).
// Pure data shapes only — no persistence or UI concerns.

export type Stage =
  | 'seed'
  | 'germinated'
  | 'seedling'
  | 'vegetative'
  | 'flowering'
  | 'fruiting'
  | 'harvest'
  | 'done';

export type SunExposure = 'full' | 'partial' | 'shade';
export type FrostTolerance = 'hardy' | 'semi' | 'tender';
export type Habit = 'compact' | 'row' | 'sprawling' | 'climbing';
export type StartMethod = 'direct' | 'indoor' | 'buy-seedling';
export type PlantingStatus = 'planned' | 'active' | 'done' | 'failed';

/** An inclusive numeric range, e.g. days-to-maturity [min, max]. */
export type Range = [min: number, max: number];

export interface Garden {
  id: string;
  name: string;
  lat: number;
  lon: number;
  lastFrostDate?: string; // ISO date (MM-DD anchored to year at runtime)
  firstFrostDate?: string;
  hardinessZone?: string;
}

export interface Bed {
  id: string;
  gardenId: string;
  name: string;
  widthCm: number;
  lengthCm: number;
  sunExposure: SunExposure;
}

export interface PropagationZone {
  id: string;
  gardenId: string;
  name: string;
  kind: 'windowsill' | 'propagator' | 'greenhouse';
  slotCount: number;
  climate: 'indoor' | 'greenhouse';
}

/** A sow/transplant window expressed relative to a frost date (§4b). */
export interface RelativeWindow {
  anchor: 'lastFrost' | 'firstFrost';
  startWeeks: number; // negative = before the anchor
  endWeeks: number;
  method: StartMethod;
}

export interface Crop {
  id: string;
  name: string;
  variety?: string;
  family: string;
  spacingCm: number;
  rowSpacingCm?: number;
  sowDepthCm: number;
  habit: Habit;
  daysToGerminate: Range;
  daysToMaturity: Range;
  gddToMaturity?: number;
  baseTempC: number;
  maxTempC?: number; // caps daily GDD so a heatwave can't over-accumulate (§5)
  frostTolerance: FrostTolerance;
  frostKillTempC?: number; // damage threshold; falls back from frostTolerance (§4)
  photoperiodSensitive?: boolean; // bolts/bulbs by daylength — GDD-only mispredicts (§5)
  startMethods: StartMethod[];
  indoorWeeks?: Range;
  sowWindows: RelativeWindow[];
  // stages and careRules land in later milestones.
}

export interface Footprint {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Planting {
  id: string;
  bedId: string;
  cropId: string;
  footprint: Footprint;
  plantCount: number;
  startMethod: StartMethod;
  propagationZoneId?: string;
  slots?: number;
  sownAt?: string;
  transplantedAt?: string;
  status: PlantingStatus;
}

export interface WeatherDay {
  gardenId: string;
  date: string; // ISO date
  tMinC: number;
  tMaxC: number;
  rainMm: number;
  // 'normal' = day-of-year climatology for forward projection past the forecast (§4c).
  source: 'history' | 'forecast' | 'normal';
}
