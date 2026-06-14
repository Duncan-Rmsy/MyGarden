// Onboarding (PLAN.md §4c): where → how big → (crops come in M3). Establish location,
// derive frost dates + climate normals from historical weather, then add the first bed.
import { useState } from 'react';
import { geocode, fetchHistory, type GeocodeResult } from '../api/openmeteo';
import { deriveFrostDates, deriveNormals } from '../domain/climate';
import type { ClimateNormalDay, DailyWeather } from '../domain/climate';
import { createGarden, createBed, saveWeather } from '../data/repo';
import BedForm, { type BedFormValues } from '../components/BedForm';
import FrostDateFields from '../components/FrostDateFields';

interface Location {
  name: string;
  lat: number;
  lon: number;
}

const inputClass =
  'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600';

function placeLabel(r: GeocodeResult): string {
  return [r.name, r.admin1, r.country].filter(Boolean).join(', ');
}

export default function Onboarding() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [location, setLocation] = useState<Location | null>(null);

  // Step 1 — place search
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locerror, setLocError] = useState<string | null>(null);

  // Step 2 — climate derivation
  const [deriving, setDeriving] = useState(false);
  const [deriveError, setDeriveError] = useState<string | null>(null);
  const [frost, setFrost] = useState({ lastFrost: '', firstFrost: '' });
  const [history, setHistory] = useState<DailyWeather[]>([]);
  const [normals, setNormals] = useState<ClimateNormalDay[]>([]);

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
        selectLocation({
          name: 'Current location',
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        }),
      () => setLocError('Could not get your location. Search for your place instead.'),
    );
  }

  async function selectLocation(loc: Location) {
    setLocation(loc);
    setStep(2);
    await runDerivation(loc);
  }

  async function runDerivation(loc: Location) {
    setDeriving(true);
    setDeriveError(null);
    try {
      const days = await fetchHistory(loc.lat, loc.lon);
      const derivedFrost = deriveFrostDates(days);
      setHistory(days);
      setNormals(deriveNormals(days));
      setFrost(derivedFrost ?? { lastFrost: '', firstFrost: '' });
    } catch {
      setDeriveError(
        'Could not fetch local climate data. You can enter frost dates manually below.',
      );
    } finally {
      setDeriving(false);
    }
  }

  async function finish(bed: BedFormValues) {
    if (!location) return;
    setSaving(true);
    try {
      const garden = await createGarden({
        name: location.name,
        lat: location.lat,
        lon: location.lon,
        lastFrostDate: frost.lastFrost || undefined,
        firstFrostDate: frost.firstFrost || undefined,
      });
      if (history.length > 0) await saveWeather(garden.id, history, normals);
      await createBed({ gardenId: garden.id, ...bed });
      // The garden now exists; App's live query swaps to the main app automatically.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-white px-5 py-8">
      <header className="mb-6">
        <p className="text-sm font-medium text-green-700">MyGarden setup</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">
          {step === 1 && 'Where do you garden?'}
          {step === 2 && 'Your local frost dates'}
          {step === 3 && 'Add your first bed'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {step === 1 && 'This sets your weather and the frost dates your calendar is built on.'}
          {step === 2 && 'Derived from ~10 years of local weather. Tweak them to your microclimate.'}
          {step === 3 && 'A growing space to plant into. You can add more later.'}
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
                      void selectLocation({ name: placeLabel(r), lat: r.lat, lon: r.lon })
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
          <p className="text-sm text-gray-600">
            📍 {location?.name}
          </p>

          {deriving && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
              Reading ~10 years of local weather…
            </div>
          )}

          {!deriving && (
            <>
              {deriveError && <p className="text-sm text-amber-600">{deriveError}</p>}
              <FrostDateFields
                lastFrost={frost.lastFrost}
                firstFrost={frost.firstFrost}
                onChange={setFrost}
              />
              <p className="text-xs text-gray-400">
                These anchor every sow and transplant date. A frost pocket or warm wall can shift
                them by weeks.
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-semibold text-gray-600"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white"
                >
                  Continue
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <BedForm
            submitLabel={saving ? 'Saving…' : 'Finish setup'}
            onSubmit={(bed) => void finish(bed)}
            onCancel={() => setStep(2)}
          />
        </div>
      )}
    </div>
  );
}

function StepDots({ step }: { step: number }) {
  return (
    <div className="mt-4 flex gap-1.5">
      {[1, 2, 3].map((n) => (
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
