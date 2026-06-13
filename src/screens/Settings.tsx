import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import ScreenHeader from '../components/ScreenHeader';
import FrostDateFields from '../components/FrostDateFields';
import { getGarden, updateGarden } from '../data/repo';

function formatMMDD(mmdd?: string): string {
  if (!mmdd) return 'Not set';
  const [mm, dd] = mmdd.split('-').map(Number);
  const month = new Date(2001, mm - 1, dd).toLocaleString('en-GB', { month: 'short' });
  return `${dd} ${month}`;
}

export default function Settings() {
  const garden = useLiveQuery(() => getGarden(), []);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ lastFrost: '', firstFrost: '' });

  function startEdit() {
    setDraft({
      lastFrost: garden?.lastFrostDate ?? '',
      firstFrost: garden?.firstFrostDate ?? '',
    });
    setEditing(true);
  }

  async function save() {
    if (!garden) return;
    await updateGarden(garden.id, {
      lastFrostDate: draft.lastFrost || undefined,
      firstFrostDate: draft.firstFrost || undefined,
    });
    setEditing(false);
  }

  return (
    <div>
      <ScreenHeader title="Settings" subtitle="Location, frost dates & notifications" />
      <div className="space-y-4 px-4">
        <section className="rounded-2xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-900">Garden</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Location</dt>
              <dd className="text-gray-900">{garden?.name ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Coordinates</dt>
              <dd className="text-gray-900">
                {garden ? `${garden.lat.toFixed(3)}, ${garden.lon.toFixed(3)}` : '—'}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Frost dates</h2>
            {!editing && (
              <button
                type="button"
                onClick={startEdit}
                className="text-sm font-medium text-green-700"
              >
                Edit
              </button>
            )}
          </div>

          {!editing ? (
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Last spring frost</dt>
                <dd className="text-gray-900">{formatMMDD(garden?.lastFrostDate)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">First autumn frost</dt>
                <dd className="text-gray-900">{formatMMDD(garden?.firstFrostDate)}</dd>
              </div>
            </dl>
          ) : (
            <div className="mt-3 space-y-3">
              <FrostDateFields
                lastFrost={draft.lastFrost}
                firstFrost={draft.firstFrost}
                onChange={setDraft}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="flex-1 rounded-xl border border-gray-300 py-2 text-sm font-semibold text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  className="flex-1 rounded-xl bg-green-600 py-2 text-sm font-semibold text-white"
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
          <p className="text-sm text-gray-500">Notification settings arrive with milestone 6.</p>
        </section>
      </div>
    </div>
  );
}
