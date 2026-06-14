// Onboarding: location → first bed (PLAN.md §4c).
// Frost dates are derived from historical weather in the background while the user
// fills in bed details; if they want to adjust them they go to Settings > Frost dates.
import { useRef, useState } from 'react';
import { geocode, fetchHistory, type GeocodeResult } from '../api/openmeteo';
import { deriveFrostDates, deriveNormals } from '../domain/climate';
import type { ClimateNormalDay, DailyWeather } from '../domain/climate';
import { createGarden, createBed, saveWeather } from '../data/repo';
import BedForm, { type BedFormValues } from '../components/BedForm';

interface Location {
  name: string;
  lat: number;
  lon: number;
}

interface WeatherResult {
  history: DailyWeather[];
  normals: ClimateNormalDay[];
  frost: { lastFrost: string; firstFrost: string };
}

const EMPTY_WEATHER: WeatherResult = {
  history: [],
  normals: [],
  frost: { lastFrost: '', firstFrost: '' },
};

const inputClass =
  'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600';

function placeLabel(r: GeocodeResult): string {
  return [r.name, r.admin1, r.country].filter(Boolean).join(', ');
}

export default function Onboarding() {
  const [step, setStep] = useState<1 | 2>(1);
  const [location, setLocation] = useState<Location | null>(null);

  // Step 1 — place search
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locerror, setLocError] = useState<string | null>(null);

  // Background climate derivation — started when location is confirmed, awaited in finish().
  const weatherRef = useRef<Promise<WeatherResult>>(Promise.resolve(EMPTY_WEATHER));
  const [deriving, setDeriving] = useState(false);

  const [saving, setSaving] = useState(false);

  async function runSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setLocError(null);
    try {
      const found = await geocode(query);
      setResults(found);
      if (found.length === 0) setLocError('No matching places found. Try a different name.');
    } catch {
      setLocError('Search failed. Check your connection and try again.');
    } finally {
      setSearching(false);
    }
  }

  function useCurrentLocation() {
    setLocError(null);
    if (!navigator.geolocation) {
      setLocError('Geolocation is not available. Search for your place instead.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        void selectLocation({
          name: 'Current location',
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        }),
      () => setLocError('Could not get your location. Search for your place instead.'),
    );
  }

  function selectLocation(loc: Location) {
    setLocation(loc);
    setStep(2);

    // Kick off weather fetch in the background — user fills bed form while it runs.
    setDeriving(true);
    weatherRef.current = fetchHistory(loc.lat, loc.lon)
      .then((days) => {
        const derived = deriveFrostDates(days);
        return {
          history: days,
          normals: deriveNormals(days),
          frost: derived ?? { lastFrost: '', firstFrost: '' },
        };
      })
      .catch(() => EMPTY_WEATHER)
      .finally(() => setDeriving(false));
  }

  async function finish(bed: BedFormValues) {
    if (!location) return;
    setSaving(true);
    try {
      // Await the background fetch (cheap if already done; waits if still running).
      const weather = await weatherRef.current;
      const garden = await createGarden({
        name: location.name,
        lat: location.lat,
        lon: location.lon,
        lastFrostDate: weather.frost.lastFrost || undefined,
        firstFrostDate: weather.frost.firstFrost || undefined,
      });
      if (weather.history.length > 0) {
        await saveWeather(garden.id, weather.history, weather.normals);
      }
      await createBed({ gardenId: garden.id, ...bed });
      // Garden now exists — App's live query swaps to the main app automatically.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-white px-5 py-8">
      <header className="mb-6">
        <p className="text-sm font-medium text-green-700">MyGarden setup</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">
          {step === 1 ? 'Where do you garden?' : 'Add your first bed'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {step === 1
            ? 'Sets your local weather and frost dates for the planting calendar.'
            : 'A growing space to plant into. You can add more later.'}
        </p>
        <StepDots step={step} />
      </header>

      {step === 1 && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={useCurrentLocation}
            className="w-full rounded-xl border border-green-600 bg-green-50 py-2.5 text-sm font-semibold text-green-700"
          >
            📍 Use my current location
          </button>

          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="h-px flex-1 bg-gray-200" />
            or search
            <span className="h-px flex-1 bg-gray-200" />
          </div>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch();
            }}
          >
            <input
              className={inputClass}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Town or city"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="rounded-xl bg-green-600 px-4 text-sm font-semibold text-white disabled:opacity-40"
            >
              {searching ? '…' : 'Search'}
            </button>
          </form>

          {locerror && <p className="text-sm text-amber-600">{locerror}</p>}

          {results.length > 0 && (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
              {results.map((r, i) => (
                <li key={`${r.lat},${r.lon},${i}`}>
                  <button
                    type="button"
                    onClick={() =>
                      selectLocation({ name: placeLabel(r), lat: r.lat, lon: r.lon })
                    }
                    className="w-full px-3 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50"
                  >
                    {placeLabel(r)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <span>📍 {location?.name}</span>
            {deriving && (
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-600">
                reading climate data…
              </span>
            )}
          </p>
          <BedForm
            submitLabel={saving ? 'Setting up your garden…' : 'Finish setup'}
            onSubmit={(bed) => void finish(bed)}
            onCancel={() => setStep(1)}
          />
        </div>
      )}
    </div>
  );
}

function StepDots({ step }: { step: number }) {
  return (
    <div className="mt-4 flex gap-1.5">
      {[1, 2].map((n) => (
        <span
          key={n}
          className={[
            'h-1.5 flex-1 rounded-full',
            n <= step ? 'bg-green-600' : 'bg-gray-200',
          ].join(' ')}
        />
      ))}
    </div>
  );
}
