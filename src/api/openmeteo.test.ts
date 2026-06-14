// Fixture tests for the Open-Meteo client (TESTING.md §4 / §6: offline, hostile-input).
// fetch is mocked — these tests never touch the live API.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { geocode, fetchHistory } from './openmeteo';

function mockFetch(body: unknown, ok = true) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response);
}

describe('geocode', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps valid API results to GeocodeResult[]', async () => {
    mockFetch({
      results: [{ name: 'London', latitude: 51.5, longitude: -0.12, country: 'GB', admin1: 'England' }],
    });
    const results = await geocode('London');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: 'London', lat: 51.5, lon: -0.12, country: 'GB', admin1: 'England' });
  });

  it('returns [] when the results field is absent', async () => {
    mockFetch({});
    expect(await geocode('XYZ')).toEqual([]);
  });

  it('returns [] without calling fetch for blank input', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    expect(await geocode('   ')).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('throws on a non-OK HTTP response', async () => {
    mockFetch({}, false);
    await expect(geocode('London')).rejects.toThrow('500');
  });
});

describe('fetchHistory — valid input', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps clean daily rows to DailyWeather[]', async () => {
    mockFetch({
      daily: {
        time: ['2024-01-01', '2024-01-02'],
        temperature_2m_min: [-2, 3],
        temperature_2m_max: [5, 10],
        precipitation_sum: [0.5, 0],
      },
    });
    const rows = await fetchHistory(51.5, -0.12, 2024);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ date: '2024-01-01', tMinC: -2, tMaxC: 5, rainMm: 0.5 });
    expect(rows[1]).toEqual({ date: '2024-01-02', tMinC: 3, tMaxC: 10, rainMm: 0 });
  });

  it('returns [] when daily field is absent', async () => {
    mockFetch({});
    expect(await fetchHistory(51.5, -0.12, 2024)).toEqual([]);
  });

  it('returns [] for an empty time array', async () => {
    mockFetch({ daily: { time: [], temperature_2m_min: [], temperature_2m_max: [], precipitation_sum: [] } });
    expect(await fetchHistory(51.5, -0.12, 2024)).toEqual([]);
  });

  it('throws on a non-OK HTTP response', async () => {
    mockFetch({}, false);
    await expect(fetchHistory(51.5, -0.12, 2024)).rejects.toThrow();
  });
});

describe('fetchHistory — hostile/malformed input', () => {
  afterEach(() => vi.restoreAllMocks());

  it('skips rows where any reading is null', async () => {
    mockFetch({
      daily: {
        time: ['2024-01-01', '2024-01-02'],
        temperature_2m_min: [null, 3],
        temperature_2m_max: [5, 10],
        precipitation_sum: [0.5, 0],
      },
    });
    const rows = await fetchHistory(51.5, -0.12, 2024);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe('2024-01-02');
  });

  it('skips rows where any reading is NaN', async () => {
    mockFetch({
      daily: {
        time: ['2024-01-01', '2024-01-02'],
        temperature_2m_min: [NaN, 3],
        temperature_2m_max: [5, 10],
        precipitation_sum: [0.5, 0],
      },
    });
    const rows = await fetchHistory(51.5, -0.12, 2024);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe('2024-01-02');
  });

  it('skips rows where any reading is Infinity', async () => {
    mockFetch({
      daily: {
        time: ['2024-01-01', '2024-01-02'],
        temperature_2m_min: [-2, 3],
        temperature_2m_max: [Infinity, 10],
        precipitation_sum: [0.5, 0],
      },
    });
    const rows = await fetchHistory(51.5, -0.12, 2024);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe('2024-01-02');
  });

  it('skips rows where a reading is a non-numeric string', async () => {
    mockFetch({
      daily: {
        time: ['2024-01-01'],
        temperature_2m_min: ['very cold' as unknown as number],
        temperature_2m_max: [5],
        precipitation_sum: [0],
      },
    });
    expect(await fetchHistory(51.5, -0.12, 2024)).toHaveLength(0);
  });

  it('skips rows beyond the end of a truncated value array (undefined reading)', async () => {
    // time has 3 entries but min only has 1 — indexes 1 and 2 yield undefined
    mockFetch({
      daily: {
        time: ['2024-01-01', '2024-01-02', '2024-01-03'],
        temperature_2m_min: [-2],
        temperature_2m_max: [5, 10, 8],
        precipitation_sum: [0.5, 0, 1],
      },
    });
    const rows = await fetchHistory(51.5, -0.12, 2024);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe('2024-01-01');
  });

  it('skips rows where an entire value array is absent', async () => {
    mockFetch({
      daily: {
        time: ['2024-01-01'],
        // temperature_2m_min absent
        temperature_2m_max: [5],
        precipitation_sum: [0],
      },
    });
    expect(await fetchHistory(51.5, -0.12, 2024)).toHaveLength(0);
  });

  it('never returns NaN or Infinity in the output regardless of mixed input', async () => {
    mockFetch({
      daily: {
        time: ['2024-01-01', '2024-01-02', '2024-01-03'],
        temperature_2m_min: [NaN, null, 4],
        temperature_2m_max: [Infinity, 12, 14],
        precipitation_sum: [0, 0, 2],
      },
    });
    const rows = await fetchHistory(51.5, -0.12, 2024);
    for (const r of rows) {
      expect(Number.isFinite(r.tMinC)).toBe(true);
      expect(Number.isFinite(r.tMaxC)).toBe(true);
      expect(Number.isFinite(r.rainMm)).toBe(true);
    }
  });
});
