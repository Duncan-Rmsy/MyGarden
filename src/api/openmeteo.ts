// Open-Meteo client (PLAN.md §3, §4c) — the only external service v1 talks to. Free,
// keyless: geocoding for place-name search and the historical archive for ~10 years of
// daily weather, from which §4c derives frost dates and climate normals.

import type { DailyWeather } from '../domain/climate';

export interface GeocodeResult {
  name: string;
  lat: number;
  lon: number;
  country?: string;
  admin1?: string; // region/state, for disambiguating same-named places
}

interface GeocodeResponse {
  results?: {
    name: string;
    latitude: number;
    longitude: number;
    country?: string;
    admin1?: string;
  }[];
}

interface ArchiveResponse {
  daily?: {
    time: string[];
    temperature_2m_min?: (number | null)[];
    temperature_2m_max?: (number | null)[];
    precipitation_sum?: (number | null)[];
  };
}

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';

/** How many years of history to pull for frost dates + normals (§4c). */
export const HISTORY_YEARS = 10;

/** Resolve a place name to candidate coordinates (§4c step 1). */
export async function geocode(name: string, count = 5): Promise<GeocodeResult[]> {
  const query = name.trim();
  if (!query) return [];
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(query)}&count=${count}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const data = (await res.json()) as GeocodeResponse;
  return (data.results ?? []).map((r) => ({
    name: r.name,
    lat: r.latitude,
    lon: r.longitude,
    country: r.country,
    admin1: r.admin1,
  }));
}

/**
 * Pull daily min/max temperature and precipitation for a point over the last
 * `HISTORY_YEARS` complete years. Rows with missing readings are skipped so the
 * derivation in §4c sees only clean data.
 */
export async function fetchHistory(
  lat: number,
  lon: number,
  endYear = new Date().getUTCFullYear() - 1,
): Promise<DailyWeather[]> {
  const startDate = `${endYear - HISTORY_YEARS + 1}-01-01`;
  const endDate = `${endYear}-12-31`;
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: startDate,
    end_date: endDate,
    daily: 'temperature_2m_min,temperature_2m_max,precipitation_sum',
    timezone: 'UTC',
  });
  const res = await fetch(`${ARCHIVE_URL}?${params}`);
  if (!res.ok) throw new Error(`Weather history failed (${res.status})`);
  const data = (await res.json()) as ArchiveResponse;
  const daily = data.daily;
  if (!daily) return [];

  const out: DailyWeather[] = [];
  for (let i = 0; i < daily.time.length; i++) {
    const tMinC = daily.temperature_2m_min?.[i] as number | null | undefined;
    const tMaxC = daily.temperature_2m_max?.[i] as number | null | undefined;
    const rainMm = daily.precipitation_sum?.[i] as number | null | undefined;
    // Number.isFinite rejects null, undefined, NaN, Infinity, and non-numeric types
    // so corrupt or truncated API responses never flow into domain derivations.
    if (!Number.isFinite(tMinC) || !Number.isFinite(tMaxC) || !Number.isFinite(rainMm)) continue;
    out.push({ date: daily.time[i], tMinC: tMinC!, tMaxC: tMaxC!, rainMm: rainMm! });
  }
  return out;
}
