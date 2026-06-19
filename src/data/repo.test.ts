// Storage-tier tests (TESTING.md — Vitest + fake-indexeddb). Cover the createPlanting
// branching the M4 planner relies on: a planned crop vs. an already-in-the-ground crop
// whose stage re-anchors the twin.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import {
  createGarden,
  createPlanting,
  getWeatherForGarden,
  saveForecast,
  getForecastAge,
  addObservation,
  listObservations,
  getLatestObservation,
  updatePlanting,
  type NewPlanting,
} from './repo';

const baseInput: NewPlanting = {
  bedId: 'bed-1',
  cropId: 'tomato',
  footprint: { x: 0, y: 0, w: 1, h: 1 },
  plantCount: 4,
  startMethod: 'direct',
};

beforeEach(async () => {
  await Promise.all([
    db.plantings.clear(),
    db.observations.clear(),
    db.weatherDays.clear(),
    db.gardens.clear(),
  ]);
});

describe('createPlanting', () => {
  it('defaults status to "planned" and omits twin anchors for a planned crop', async () => {
    const planting = await createPlanting(baseInput);
    expect(planting.status).toBe('planned');
    expect(planting.sownAt).toBeUndefined();
    expect(planting.currentStage).toBeUndefined();

    const stored = await db.plantings.get(planting.id);
    expect(stored?.status).toBe('planned');
    expect(stored?.sownAt).toBeUndefined();
    expect(stored?.currentStage).toBeUndefined();
  });

  it('persists status, sownAt and currentStage for an already-planted crop', async () => {
    const planting = await createPlanting({
      ...baseInput,
      status: 'active',
      sownAt: '2026-05-01',
      currentStage: 'fruiting',
    });
    expect(planting.status).toBe('active');

    const stored = await db.plantings.get(planting.id);
    expect(stored).toMatchObject({
      status: 'active',
      sownAt: '2026-05-01',
      currentStage: 'fruiting',
    });
  });

  it('assigns a unique id to each planting', async () => {
    const a = await createPlanting(baseInput);
    const b = await createPlanting(baseInput);
    expect(a.id).not.toBe(b.id);
    expect(await db.plantings.count()).toBe(2);
  });
});

describe('getWeatherForGarden', () => {
  it('returns empty buckets when no rows exist', async () => {
    const result = await getWeatherForGarden('garden-1');
    expect(result).toEqual({ history: [], normals: [], forecast: [] });
  });

  it('returns history rows in the history bucket', async () => {
    await db.weatherDays.bulkAdd([
      { gardenId: 'g1', date: '2025-06-01', tMinC: 10, tMaxC: 20, rainMm: 0, source: 'history' },
      { gardenId: 'g1', date: '2025-06-02', tMinC: 11, tMaxC: 21, rainMm: 1, source: 'history' },
    ]);
    const result = await getWeatherForGarden('g1');
    expect(result.history).toHaveLength(2);
    expect(result.forecast).toHaveLength(0);
    expect(result.normals).toHaveLength(0);
  });

  it('returns forecast rows in the forecast bucket', async () => {
    await db.weatherDays.bulkAdd([
      { gardenId: 'g1', date: '2026-06-20', tMinC: 12, tMaxC: 22, rainMm: 0, source: 'forecast' },
    ]);
    const result = await getWeatherForGarden('g1');
    expect(result.forecast).toHaveLength(1);
    expect(result.history).toHaveLength(0);
    expect(result.normals).toHaveLength(0);
  });

  it('converts normal rows (sentinel year 0001) to ClimateNormalDay with correct doy', async () => {
    await db.weatherDays.bulkAdd([
      { gardenId: 'g1', date: '0001-01-01', tMinC: 2, tMaxC: 8, rainMm: 2, source: 'normal' },
      { gardenId: 'g1', date: '0001-12-31', tMinC: 1, tMaxC: 7, rainMm: 1, source: 'normal' },
    ]);
    const result = await getWeatherForGarden('g1');
    expect(result.normals).toHaveLength(2);
    expect(result.history).toHaveLength(0);
    expect(result.forecast).toHaveLength(0);
    const jan1 = result.normals.find((n) => n.doy === 1);
    expect(jan1).toBeDefined();
    expect(jan1?.tMinC).toBe(2);
    const dec31 = result.normals.find((n) => n.doy === 365);
    expect(dec31).toBeDefined();
    expect(dec31?.tMinC).toBe(1);
  });

  it('isolates rows by gardenId — two gardens do not cross-contaminate', async () => {
    await db.weatherDays.bulkAdd([
      { gardenId: 'g1', date: '2025-06-01', tMinC: 10, tMaxC: 20, rainMm: 0, source: 'history' },
      { gardenId: 'g2', date: '2025-06-01', tMinC: 5, tMaxC: 15, rainMm: 3, source: 'history' },
    ]);
    const g1 = await getWeatherForGarden('g1');
    const g2 = await getWeatherForGarden('g2');
    expect(g1.history).toHaveLength(1);
    expect(g1.history[0].tMinC).toBe(10);
    expect(g2.history).toHaveLength(1);
    expect(g2.history[0].tMinC).toBe(5);
  });
});

describe('saveForecast', () => {
  it('stores forecast rows with correct fields', async () => {
    const garden = await createGarden({ name: 'Test', lat: 51, lon: -1 });
    await saveForecast(garden.id, [
      { date: '2026-06-20', tMinC: 12, tMaxC: 22, rainMm: 0 },
      { date: '2026-06-21', tMinC: 13, tMaxC: 23, rainMm: 1 },
    ]);
    const rows = await db.weatherDays.where('gardenId').equals(garden.id).toArray();
    const forecast = rows.filter((r) => r.source === 'forecast');
    expect(forecast).toHaveLength(2);
    expect(forecast[0]).toMatchObject({ gardenId: garden.id, source: 'forecast', tMinC: 12 });
  });

  it('stamps forecastFetchedAt on the garden', async () => {
    const garden = await createGarden({ name: 'Test', lat: 51, lon: -1 });
    const before = Date.now();
    await saveForecast(garden.id, [{ date: '2026-06-20', tMinC: 10, tMaxC: 20, rainMm: 0 }]);
    const after = Date.now();
    const updated = await db.gardens.get(garden.id);
    expect(updated?.forecastFetchedAt).toBeDefined();
    const ts = new Date(updated!.forecastFetchedAt!).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('replaces existing forecast rows on second call', async () => {
    const garden = await createGarden({ name: 'Test', lat: 51, lon: -1 });
    await saveForecast(garden.id, [
      { date: '2026-06-20', tMinC: 10, tMaxC: 20, rainMm: 0 },
      { date: '2026-06-21', tMinC: 11, tMaxC: 21, rainMm: 0 },
    ]);
    await saveForecast(garden.id, [
      { date: '2026-06-22', tMinC: 14, tMaxC: 24, rainMm: 2 },
    ]);
    const rows = await db.weatherDays.where('gardenId').equals(garden.id).toArray();
    const forecast = rows.filter((r) => r.source === 'forecast');
    expect(forecast).toHaveLength(1);
    expect(forecast[0].date).toBe('2026-06-22');
  });

  it('clears existing forecast when called with empty array', async () => {
    const garden = await createGarden({ name: 'Test', lat: 51, lon: -1 });
    await saveForecast(garden.id, [{ date: '2026-06-20', tMinC: 10, tMaxC: 20, rainMm: 0 }]);
    await saveForecast(garden.id, []);
    const rows = await db.weatherDays.where('gardenId').equals(garden.id).toArray();
    const forecast = rows.filter((r) => r.source === 'forecast');
    expect(forecast).toHaveLength(0);
  });
});

describe('getForecastAge', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when garden has no forecastFetchedAt', async () => {
    const garden = await createGarden({ name: 'Test', lat: 51, lon: -1 });
    const age = await getForecastAge(garden.id);
    expect(age).toBeNull();
  });

  it('returns milliseconds since forecast was saved', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    const garden = await createGarden({ name: 'Test', lat: 51, lon: -1 });
    await saveForecast(garden.id, [{ date: '2026-01-02', tMinC: 5, tMaxC: 10, rainMm: 0 }]);
    vi.setSystemTime(new Date('2026-01-01T13:00:00Z'));
    expect(await getForecastAge(garden.id)).toBe(3_600_000); // 1 hour in ms
  });
});

describe('addObservation', () => {
  it('persists observation with correct fields', async () => {
    const obs = await addObservation({
      plantingId: 'p-1',
      kind: 'note',
      at: '2026-06-01',
      note: 'Looking healthy',
    });
    const stored = await db.observations.get(obs.id);
    expect(stored).toMatchObject({
      plantingId: 'p-1',
      kind: 'note',
      at: '2026-06-01',
      note: 'Looking healthy',
    });
  });

  it('generates a unique id', async () => {
    const a = await addObservation({ plantingId: 'p-1', kind: 'note', at: '2026-06-01' });
    const b = await addObservation({ plantingId: 'p-1', kind: 'note', at: '2026-06-02' });
    expect(a.id).not.toBe(b.id);
  });

  it('sets createdAt with fake timers', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-15T09:00:00Z'));
    const obs = await addObservation({ plantingId: 'p-1', kind: 'note', at: '2026-06-15' });
    expect(obs.createdAt).toBe('2026-06-15T09:00:00.000Z');
    vi.useRealTimers();
  });

  it('supports kind "note" with note field', async () => {
    const obs = await addObservation({
      plantingId: 'p-2',
      kind: 'note',
      at: '2026-06-10',
      note: 'Spotted aphids',
    });
    expect(obs.kind).toBe('note');
    expect(obs.note).toBe('Spotted aphids');
  });

  it('supports kind "stage_reached" with stage and twin fields', async () => {
    const obs = await addObservation({
      plantingId: 'p-3',
      kind: 'stage_reached',
      at: '2026-06-10',
      stage: 'flowering',
      twinProjectedDate: '2026-06-12',
      deltaDays: -2,
    });
    expect(obs.kind).toBe('stage_reached');
    expect(obs.stage).toBe('flowering');
    expect(obs.twinProjectedDate).toBe('2026-06-12');
    expect(obs.deltaDays).toBe(-2);
  });
});

describe('listObservations', () => {
  it('returns empty list for unknown plantingId', async () => {
    const result = await listObservations('unknown');
    expect(result).toEqual([]);
  });

  it('returns observations sorted by at ASC', async () => {
    // Insert in reverse order
    await addObservation({ plantingId: 'p-1', kind: 'note', at: '2026-06-10' });
    await addObservation({ plantingId: 'p-1', kind: 'note', at: '2026-06-05' });
    await addObservation({ plantingId: 'p-1', kind: 'note', at: '2026-06-08' });
    const result = await listObservations('p-1');
    expect(result.map((o) => o.at)).toEqual(['2026-06-05', '2026-06-08', '2026-06-10']);
  });

  it('only returns observations for the requested plantingId', async () => {
    await addObservation({ plantingId: 'p-1', kind: 'note', at: '2026-06-01' });
    await addObservation({ plantingId: 'p-2', kind: 'note', at: '2026-06-01' });
    const result = await listObservations('p-1');
    expect(result).toHaveLength(1);
    expect(result[0].plantingId).toBe('p-1');
  });
});

describe('getLatestObservation', () => {
  it('returns undefined for empty', async () => {
    const result = await getLatestObservation('unknown');
    expect(result).toBeUndefined();
  });

  it('returns the chronologically latest observation', async () => {
    await addObservation({ plantingId: 'p-1', kind: 'note', at: '2026-06-05' });
    await addObservation({ plantingId: 'p-1', kind: 'note', at: '2026-06-10' });
    await addObservation({ plantingId: 'p-1', kind: 'note', at: '2026-06-08' });
    const latest = await getLatestObservation('p-1');
    expect(latest?.at).toBe('2026-06-10');
  });
});

describe('updatePlanting', () => {
  it('updates status field', async () => {
    const planting = await createPlanting(baseInput);
    await updatePlanting(planting.id, { status: 'active' });
    const stored = await db.plantings.get(planting.id);
    expect(stored?.status).toBe('active');
  });

  it('updates currentStage field', async () => {
    const planting = await createPlanting(baseInput);
    await updatePlanting(planting.id, { currentStage: 'seedling' });
    const stored = await db.plantings.get(planting.id);
    expect(stored?.currentStage).toBe('seedling');
  });

  it('does not affect other fields (bedId unchanged)', async () => {
    const planting = await createPlanting(baseInput);
    await updatePlanting(planting.id, { status: 'active' });
    const stored = await db.plantings.get(planting.id);
    expect(stored?.bedId).toBe('bed-1');
    expect(stored?.cropId).toBe('tomato');
  });

  it('does not throw for a non-existent planting id', async () => {
    await expect(updatePlanting('non-existent', { status: 'done' })).resolves.not.toThrow();
  });
});
