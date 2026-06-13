// Storage helpers over Dexie (PLAN.md §3). Thin, typed wrappers the UI calls so screens
// never poke the schema directly. Pure domain logic stays in src/domain; this layer only
// reads/writes IndexedDB.

import { db } from './db';
import type { Bed, CultivationMethod, Garden, SunExposure } from './types';
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
