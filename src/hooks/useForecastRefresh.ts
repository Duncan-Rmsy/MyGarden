import { useEffect } from 'react';
import type { Garden } from '../data/types';
import { getForecastAge, saveForecast } from '../data/repo';
import { fetchForecast } from '../api/openmeteo';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/**
 * Fire-and-forget hook: refreshes the stored forecast for the garden if the cached
 * copy is missing or older than 6 hours. Errors are swallowed — stale normals are
 * used as fallback by buildWeatherSeries.
 */
export function useForecastRefresh(garden: Garden | undefined | null): void {
  useEffect(() => {
    if (!garden) return;
    const { id, lat, lon } = garden;
    void (async () => {
      try {
        const age = await getForecastAge(id);
        if (age !== null && age < SIX_HOURS_MS) return;
        const days = await fetchForecast(lat, lon);
        await saveForecast(id, days);
      } catch {
        // Best-effort — stale/absent forecast degrades to climate normals
      }
    })();
  }, [garden?.id]);
}
