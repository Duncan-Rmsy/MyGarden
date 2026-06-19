// Storage helpers over Dexie (PLAN.md §3). Thin, typed wrappers the UI calls so screens
// never poke the schema directly. Pure domain logic stays in src/domain; this layer only
// reads/writes IndexedDB.

import { db } from './db';
import type { Bed, Crop, CultivationMethod, Footprint, Garden, Planting, PlantingStatus, StartMethod, SunExposure } from './types';
import type { ClimateNormalDay, DailyWeather } from '../domain/climate';
import { doyToMMDD } from '../domain/climate';

const uid = () => crypto.randomUUID();

/**
 * Normals are stored as WeatherDay rows in a synthetic sentinel year so they never
 * collide with real history (which only covers recent calendar years) and the twin
 * (M4) can recover the day-of-year from the month/day. Kept in one place so the
 * encoding can evolve without touching callers.
 */
const NORMAL_YEAR = '0001';

export interface NewGarden {
  name: string;
  lat: number;
  lon: number;
  lastFrostDate?: string; // MM-DD
  firstFrostDate?: string;
  hardinessZone?: string;
}

export interface NewBed {
  gardenId: string;
  name: string;
  widthCm: number;
  lengthCm: number;
  sunExposure: SunExposure;
  cultivationMethod: CultivationMethod;
}

/** The single garden, if onboarding has completed. v1 is single-garden. */
export async function getGarden(): Promise<Garden | undefined> {
  return db.gardens.toCollection().first();
}

export async function createGarden(input: NewGarden): Promise<Garden> {
  const garden: Garden = { id: uid(), ...input };
  await db.gardens.add(garden);
  return garden;
}

export async function updateGarden(id: string, changes: Partial<Garden>): Promise<void> {
  await db.gardens.update(id, changes);
}

/**
 * Persist a garden's historical weather and derived normals together (§4c) — one pull,
 * stored once. History rows are real dates (source 'history'); normals use the sentinel
 * year (source 'normal'). Replaces any prior weather for the garden so re-deriving after
 * a location edit doesn't leave stale rows.
 */
export async function saveWeather(
  gardenId: string,
  history: DailyWeather[],
  normals: ClimateNormalDay[],
): Promise<void> {
  const historyRows = history.map((d) => ({
    gardenId,
    date: d.date,
    tMinC: d.tMinC,
    tMaxC: d.tMaxC,
    rainMm: d.rainMm,
    source: 'history' as const,
  }));
  const normalRows = normals.map((n) => ({
    gardenId,
    date: `${NORMAL_YEAR}-${doyToMMDD(n.doy)}`,
    tMinC: n.tMinC,
    tMaxC: n.tMaxC,
    rainMm: n.rainMm,
    source: 'normal' as const,
  }));
  await db.transaction('rw', db.weatherDays, async () => {
    await db.weatherDays.where('gardenId').equals(gardenId).delete();
    await db.weatherDays.bulkAdd([...historyRows, ...normalRows]);
  });
}

export async function listBeds(gardenId: string): Promise<Bed[]> {
  return db.beds.where('gardenId').equals(gardenId).toArray();
}

export async function createBed(input: NewBed): Promise<Bed> {
  const bed: Bed = { id: uid(), ...input };
  await db.beds.add(bed);
  return bed;
}

export async function updateBed(id: string, changes: Partial<Bed>): Promise<void> {
  await db.beds.update(id, changes);
}

export async function deleteBed(id: string): Promise<void> {
  await db.beds.delete(id);
}

// ── Crops ─────────────────────────────────────────────────────────────────────

export async function listCrops(): Promise<Crop[]> {
  return db.crops.orderBy('name').toArray();
}

export async function getCrop(id: string): Promise<Crop | undefined> {
  return db.crops.get(id);
}

/**
 * Clone a catalog entry into a user-customisable personal variety (§4b). The caller
 * supplies any field overrides (e.g. a different name or variety string); everything
 * else is copied from the source. Only the clone is writable; the original is untouched.
 */
export async function cloneCrop(
  sourceId: string,
  overrides: Partial<Omit<Crop, 'id' | 'isCustom' | 'clonedFromId'>>,
): Promise<Crop> {
  const source = await db.crops.get(sourceId);
  if (!source) throw new Error(`Crop "${sourceId}" not found`);
  const clone: Crop = {
    ...source,
    ...overrides,
    id: uid(),
    isCustom: true,
    clonedFromId: sourceId,
  };
  await db.crops.add(clone);
  return clone;
}

export async function updateCrop(id: string, changes: Partial<Crop>): Promise<void> {
  const crop = await db.crops.get(id);
  if (!crop?.isCustom) throw new Error('Only custom crops can be edited');
  await db.crops.update(id, changes);
}

export async function deleteCustomCrop(id: string): Promise<void> {
  const crop = await db.crops.get(id);
  if (!crop?.isCustom) throw new Error('Only custom crops can be deleted');
  await db.crops.delete(id);
}

// ── Plantings ─────────────────────────────────────────────────────────────────

export interface NewPlanting {
  bedId: string;
  cropId: string;
  footprint: Footprint;
  plantCount: number;
  startMethod: StartMethod;
  /** Override default 'planned' for crops already in the ground. */
  status?: PlantingStatus;
  sownAt?: string;
  currentStage?: Planting['currentStage'];
}

export interface PlantingWithCrop {
  planting: Planting;
  crop: Crop;
}

export async function listPlantingsWithCrops(bedId: string): Promise<PlantingWithCrop[]> {
  const plantings = await db.plantings.where('bedId').equals(bedId).toArray();
  const cropIds = [...new Set(plantings.map((p) => p.cropId))];
  const crops = await db.crops.bulkGet(cropIds);
  const cropMap = new Map(
    crops.filter((c): c is Crop => c !== undefined).map((c) => [c.id, c]),
  );
  return plantings
    .filter((p) => cropMap.has(p.cropId))
    .map((p) => ({ planting: p, crop: cropMap.get(p.cropId)! }));
}

export async function createPlanting(input: NewPlanting): Promise<Planting> {
  const planting: Planting = {
    id: uid(),
    status: input.status ?? 'planned',
    bedId: input.bedId,
    cropId: input.cropId,
    footprint: input.footprint,
    plantCount: input.plantCount,
    startMethod: input.startMethod,
    ...(input.sownAt && { sownAt: input.sownAt }),
    ...(input.currentStage && { currentStage: input.currentStage }),
  };
  await db.plantings.add(planting);
  return planting;
}

export async function deletePlanting(id: string): Promise<void> {
  await db.plantings.delete(id);
}
