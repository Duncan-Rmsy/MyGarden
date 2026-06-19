// Fixture tests for the Open-Meteo client (TESTING.md §4 / §6: offline, hostile-input).
// fetch is mocked — these tests never touch the live API.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fc from 'fast-check';
import { geocode, fetchHistory, fetchForecast } from './openmeteo';

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

describe('fetchForecast — valid input', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps clean daily rows to DailyWeather[]', async () => {
    mockFetch({
      daily: {
        time: ['2025-06-19', '2025-06-20'],
        temperature_2m_min: [10, 8],
        temperature_2m_max: [22, 20],
        precipitation_sum: [1.5, 0],
      },
    });
    const rows = await fetchForecast(51.5, -0.12);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ date: '2025-06-19', tMinC: 10, tMaxC: 22, rainMm: 1.5 });
    expect(rows[1]).toEqual({ date: '2025-06-20', tMinC: 8, tMaxC: 20, rainMm: 0 });
  });

  it('returns [] when daily field is absent', async () => {
    mockFetch({});
    expect(await fetchForecast(51.5, -0.12)).toEqual([]);
  });

  it('returns [] for an empty time array', async () => {
    mockFetch({ daily: { time: [], temperature_2m_min: [], temperature_2m_max: [], precipitation_sum: [] } });
    expect(await fetchForecast(51.5, -0.12)).toEqual([]);
  });

  it('throws on a non-OK HTTP response and message contains status code', async () => {
    mockFetch({}, false);
    await expect(fetchForecast(51.5, -0.12)).rejects.toThrow('500');
  });
});

describe('fetchForecast — hostile/malformed input', () => {
  afterEach(() => vi.restoreAllMocks());

  it('skips rows where any reading is null', async () => {
    mockFetch({ daily: { time: ['2025-06-19', '2025-06-20'], temperature_2m_min: [null, 3], temperature_2m_max: [20, 18], precipitation_sum: [0, 1] } });
    const rows = await fetchForecast(0, 0);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe('2025-06-20');
  });

  it('skips rows where any reading is NaN', async () => {
    mockFetch({ daily: { time: ['2025-06-19', '2025-06-20'], temperature_2m_min: [NaN, 3], temperature_2m_max: [20, 18], precipitation_sum: [0, 1] } });
    const rows = await fetchForecast(0, 0);
    expect(rows).toHaveLength(1);
  });

  it('skips rows where any reading is Infinity', async () => {
    mockFetch({ daily: { time: ['2025-06-19', '2025-06-20'], temperature_2m_min: [5, 3], temperature_2m_max: [20, 18], precipitation_sum: [Infinity, 1] } });
    const rows = await fetchForecast(0, 0);
    expect(rows).toHaveLength(1);
  });

  it('skips rows where a reading is a non-numeric string', async () => {
    mockFetch({ daily: { time: ['2025-06-19'], temperature_2m_min: ['warm' as unknown as number], temperature_2m_max: [20], precipitation_sum: [0] } });
    expect(await fetchForecast(0, 0)).toHaveLength(0);
  });

  it('skips rows beyond the end of a truncated value array', async () => {
    mockFetch({ daily: { time: ['2025-06-19', '2025-06-20', '2025-06-21'], temperature_2m_min: [5], temperature_2m_max: [20], precipitation_sum: [0] } });
    const rows = await fetchForecast(0, 0);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe('2025-06-19');
  });

  it('skips rows where an entire value array is absent', async () => {
    mockFetch({ daily: { time: ['2025-06-19'], temperature_2m_min: [5], temperature_2m_max: [20] } });
    expect(await fetchForecast(0, 0)).toHaveLength(0);
  });
});

describe('fetchForecast invariants (property-based)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('never returns non-finite values regardless of mixed null/undefined/string/number input', async () => {
    const mixedVal = fc.oneof(
      fc.double({ noNaN: false }),
      fc.constant(null),
      fc.constant(undefined as unknown as number),
      fc.string().map((s) => s as unknown as number),
    );
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(mixedVal, mixedVal, mixedVal), { maxLength: 30 }),
        async (rows) => {
          const time = rows.map((_, i) => `2025-01-${String(i + 1).padStart(2, '0')}`);
          mockFetch({
            daily: {
              time,
              temperature_2m_min: rows.map(([a]) => a),
              temperature_2m_max: rows.map(([, b]) => b),
              precipitation_sum: rows.map(([,, c]) => c),
            },
          });
          const result = await fetchForecast(0, 0);
          for (const r of result) {
            expect(Number.isFinite(r.tMinC)).toBe(true);
            expect(Number.isFinite(r.tMaxC)).toBe(true);
            expect(Number.isFinite(r.rainMm)).toBe(true);
          }
        },
      ),
    );
  });
});
