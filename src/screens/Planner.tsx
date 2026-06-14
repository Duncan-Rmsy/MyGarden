// M2: crop catalog browser (PLAN.md §4b, §4d). In M3 this screen gains the bed-grid
// placer; for now it serves as the catalog so crops are visible and cloneable.
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import ScreenHeader from '../components/ScreenHeader';
import { listCrops, cloneCrop, deleteCustomCrop } from '../data/repo';
import { cropConfidence } from '../domain/confidence';
import type { Crop } from '../data/types';

const inputClass =
  'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600';

const HABIT_LABEL: Record<Crop['habit'], string> = {
  compact: 'Compact',
  row: 'Row',
  sprawling: 'Sprawling',
  climbing: 'Climbing',
};

const METHOD_LABEL: Record<string, string> = {
  direct: 'Direct sow',
  indoor: 'Start indoors',
  'buy-seedling': 'Buy seedling',
};

export default function Planner() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Crop | null>(null);
  const [cloning, setCloning] = useState(false);

  const crops = useLiveQuery(() => listCrops(), []);

  const q = query.toLowerCase().trim();
  const filtered = crops?.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.family.toLowerCase().includes(q) ||
      (c.variety ?? '').toLowerCase().includes(q),
  );

  // Group by family for the non-search view; custom crops get their own section.
  const grouped =
    q.length > 0
      ? null
      : filtered?.reduce<Map<string, Crop[]>>((acc, crop) => {
          const key = crop.isCustom ? 'My varieties' : crop.family;
          const list = acc.get(key) ?? [];
          list.push(crop);
          acc.set(key, list);
          return acc;
        }, new Map());

  async function handleClone(crop: Crop) {
    setCloning(true);
    try {
      await cloneCrop(crop.id, {
        name: crop.name,
        variety: crop.variety ? `${crop.variety} (copy)` : 'My variety',
      });
      setSelected(null);
    } finally {
      setCloning(false);
    }
  }

  async function handleDelete(crop: Crop) {
    if (!confirm(`Delete "${crop.name}"?`)) return;
    await deleteCustomCrop(crop.id);
    setSelected(null);
  }

  return (
    <div>
      <ScreenHeader title="Planner" subtitle="Browse crops and plan what to grow" />
      <div className="px-4 pb-4">
        <input
          className={inputClass}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search crops or family…"
          aria-label="Search crops"
          autoComplete="off"
        />
      </div>

      {!crops ? (
        <p className="px-4 text-sm text-gray-400">Loading…</p>
      ) : filtered?.length === 0 ? (
        <p className="px-4 text-sm text-gray-500">No crops match "{query}".</p>
      ) : q.length > 0 ? (
        <CropList crops={filtered!} onSelect={setSelected} />
      ) : (
        <div>
          {grouped &&
            [...grouped.entries()]
              .sort(([a], [b]) =>
                a === 'My varieties' ? -1 : b === 'My varieties' ? 1 : a.localeCompare(b),
              )
              .map(([family, list]) => (
                <section key={family} className="mb-4">
                  <h2 className="sticky top-0 bg-white px-4 py-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {family}
                  </h2>
                  <CropList crops={list} onSelect={setSelected} />
                </section>
              ))}
        </div>
      )}

      {selected && (
        <Sheet title={selected.name} onClose={() => setSelected(null)}>
          <CropDetail
            crop={selected}
            onClone={() => void handleClone(selected)}
            onDelete={selected.isCustom ? () => void handleDelete(selected) : undefined}
            cloning={cloning}
          />
        </Sheet>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CropList({ crops, onSelect }: { crops: Crop[]; onSelect: (c: Crop) => void }) {
  return (
    <ul className="divide-y divide-gray-100">
      {crops.map((crop) => {
        const confidence = cropConfidence(crop);
        return (
          <li key={crop.id}>
            <button
              type="button"
              onClick={() => onSelect(crop)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
            >
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium text-gray-900">
                  {crop.name}
                  {crop.variety && (
                    <span className="ml-1 font-normal text-gray-500">— {crop.variety}</span>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-gray-500">
                  {crop.spacingCm} cm spacing · {crop.daysToMaturity[0]}–{crop.daysToMaturity[1]} days
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {confidence === 'precise' && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    GDD
                  </span>
                )}
                {crop.isCustom && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                    Custom
                  </span>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function CropDetail({
  crop,
  onClone,
  onDelete,
  cloning,
}: {
  crop: Crop;
  onClone: () => void;
  onDelete?: () => void;
  cloning: boolean;
}) {
  const confidence = cropConfidence(crop);
  return (
    <div className="space-y-4 pb-2">
      <div className="flex flex-wrap gap-2">
        <Chip>{crop.family}</Chip>
        <Chip>{HABIT_LABEL[crop.habit]}</Chip>
        {confidence === 'precise' ? (
          <Chip variant="green">GDD-tuned</Chip>
        ) : (
          <Chip variant="gray">Day-range estimate</Chip>
        )}
        {crop.photoperiodSensitive && <Chip variant="amber">Daylength sensitive</Chip>}
        {crop.isCustom && <Chip variant="blue">My variety</Chip>}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Row label="Spacing" value={`${crop.spacingCm} cm`} />
        {crop.rowSpacingCm && <Row label="Row spacing" value={`${crop.rowSpacingCm} cm`} />}
        <Row label="Sow depth" value={`${crop.sowDepthCm} cm`} />
        <Row label="Germination" value={`${crop.daysToGerminate[0]}–${crop.daysToGerminate[1]} days`} />
        <Row
          label="Days to maturity"
          value={`${crop.daysToMaturity[0]}–${crop.daysToMaturity[1]} days`}
        />
        {crop.gddToMaturity && <Row label="GDD to maturity" value={String(crop.gddToMaturity)} />}
        <Row label="Frost tolerance" value={crop.frostTolerance} />
        <Row
          label="Start method"
          value={crop.startMethods.map((m) => METHOD_LABEL[m]).join(', ')}
        />
        {crop.indoorWeeks && (
          <Row label="Indoor weeks" value={`${crop.indoorWeeks[0]}–${crop.indoorWeeks[1]}`} />
        )}
      </dl>

      {crop.sowWindows.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-gray-700">Sow windows</h3>
          <ul className="space-y-1 text-sm text-gray-600">
            {crop.sowWindows.map((w, i) => (
              <li key={i}>
                {METHOD_LABEL[w.method]}:{' '}
                {weeksLabel(w.startWeeks, w.endWeeks, w.anchor === 'lastFrost' ? 'last frost' : 'first frost')}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="flex-1 rounded-xl border border-red-300 py-2.5 text-sm font-semibold text-red-600"
          >
            Delete
          </button>
        )}
        <button
          type="button"
          onClick={onClone}
          disabled={cloning}
          className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {cloning ? 'Cloning…' : 'Clone to customise'}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900 capitalize">{value}</dd>
    </>
  );
}

function Chip({
  children,
  variant = 'gray',
}: {
  children: React.ReactNode;
  variant?: 'gray' | 'green' | 'amber' | 'blue';
}) {
  const cls: Record<typeof variant, string> = {
    gray:  'bg-gray-100 text-gray-600',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
    blue:  'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls[variant]}`}>
      {children}
    </span>
  );
}

function weeksLabel(startWeeks: number, endWeeks: number, anchor: string): string {
  function fmt(weeks: number): string {
    const abs = Math.abs(weeks);
    if (abs === 0) return `at ${anchor}`;
    return weeks < 0 ? `${abs}w before ${anchor}` : `${abs}w after ${anchor}`;
  }
  if (startWeeks === endWeeks) return fmt(startWeeks);
  return `${fmt(startWeeks)} to ${fmt(endWeeks)}`;
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div className="relative mx-auto w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl max-h-[85vh]">
        <h2 className="mb-4 text-lg font-bold text-gray-900">{title}</h2>
        {children}
      </div>
    </div>
  );
}
