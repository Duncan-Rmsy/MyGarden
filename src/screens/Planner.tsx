// M3: Planner — bed grid + crop catalog (PLAN.md §4a, §4d).
// Two tabs: Layout (grid placement) and Catalog (M2 browser).
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import ScreenHeader from '../components/ScreenHeader';
import {
  getGarden,
  listBeds,
  listCrops,
  listPlantingsWithCrops,
  createPlanting,
  deletePlanting,
  cloneCrop,
  deleteCustomCrop,
  type PlantingWithCrop,
} from '../data/repo';
import {
  cropCellsNeeded,
  isFootprintOccupied,
  blockCapacity,
  plantingCalendar,
  cellsAcross,
} from '../domain/planner';
import { cropConfidence } from '../domain/confidence';
import type { Crop, Bed } from '../data/types';

const DEFAULT_CELL_CM = 30;

// ── Crop family colour palette ────────────────────────────────────────────────

const FAMILY_COLOR: Record<string, string> = {
  Solanaceae: 'bg-red-200 border-red-300',
  Cucurbitaceae: 'bg-yellow-200 border-yellow-300',
  Leguminosae: 'bg-green-200 border-green-300',
  Brassicaceae: 'bg-purple-200 border-purple-300',
  Asteraceae: 'bg-lime-200 border-lime-300',
  Apiaceae: 'bg-orange-200 border-orange-300',
  Alliaceae: 'bg-violet-200 border-violet-300',
  Amaranthaceae: 'bg-pink-200 border-pink-300',
  Lamiaceae: 'bg-teal-200 border-teal-300',
  Poaceae: 'bg-amber-200 border-amber-300',
  Rosaceae: 'bg-rose-200 border-rose-300',
};
const DEFAULT_COLOR = 'bg-gray-200 border-gray-300';

function familyColor(family: string): string {
  return FAMILY_COLOR[family] ?? DEFAULT_COLOR;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const METHOD_LABEL: Record<string, string> = {
  direct: 'Direct sow',
  indoor: 'Start indoors',
  'buy-seedling': 'Buy seedling',
};

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-green-100 text-green-700',
  upcoming: 'bg-amber-100 text-amber-700',
  closed: 'bg-gray-100 text-gray-500',
  'too-late': 'bg-red-100 text-red-600',
};

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

const today = new Date().toISOString().slice(0, 10);

// ── Root screen ───────────────────────────────────────────────────────────────

type Tab = 'layout' | 'catalog';

export default function Planner() {
  const [tab, setTab] = useState<Tab>('layout');

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Planner" subtitle="Lay out beds and browse crops" />

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 px-4">
        {(['layout', 'catalog'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={[
              'mr-4 border-b-2 pb-2 text-sm font-medium capitalize transition-colors',
              tab === t
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-500',
            ].join(' ')}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'layout' ? <LayoutTab /> : <CatalogTab />}
      </div>
    </div>
  );
}

// ── Layout tab ────────────────────────────────────────────────────────────────

type LayoutView = 'grid' | 'calendar';

function LayoutTab() {
  const garden = useLiveQuery(() => getGarden(), []);
  const beds = useLiveQuery(
    () => (garden ? listBeds(garden.id) : Promise.resolve([])),
    [garden?.id],
  );

  const [selectedBedId, setSelectedBedId] = useState<string | null>(null);
  const [view, setView] = useState<LayoutView>('grid');

  const bed = beds?.find((b) => b.id === selectedBedId) ?? beds?.[0] ?? null;

  if (!beds) return <p className="px-4 py-6 text-sm text-gray-400">Loading…</p>;
  if (beds.length === 0)
    return (
      <div className="px-4 py-6 text-center text-sm text-gray-500">
        Add a bed in the <strong>Beds</strong> tab to start planning.
      </div>
    );

  const cellSizeCm = garden?.cellSizeCm ?? DEFAULT_CELL_CM;

  return (
    <div className="space-y-3 py-3">
      {/* Bed selector */}
      {beds.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4">
          {beds.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelectedBedId(b.id)}
              className={[
                'shrink-0 rounded-full border px-3 py-1 text-sm font-medium',
                (bed?.id === b.id)
                  ? 'border-green-600 bg-green-50 text-green-700'
                  : 'border-gray-300 text-gray-600',
              ].join(' ')}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* View toggle */}
      <div className="flex gap-2 px-4">
        {(['grid', 'calendar'] as LayoutView[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={[
              'rounded-lg border px-3 py-1 text-sm font-medium capitalize',
              view === v
                ? 'border-green-600 bg-green-50 text-green-700'
                : 'border-gray-200 text-gray-500',
            ].join(' ')}
          >
            {v}
          </button>
        ))}
      </div>

      {bed && view === 'grid' && (
        <BedGridView bed={bed} cellSizeCm={cellSizeCm} garden={garden ?? undefined} />
      )}
      {bed && view === 'calendar' && (
        <CalendarView bed={bed} garden={garden ?? undefined} />
      )}
    </div>
  );
}

// ── Bed grid ──────────────────────────────────────────────────────────────────

function BedGridView({
  bed,
  cellSizeCm,
  garden,
}: {
  bed: Bed;
  cellSizeCm: number;
  garden?: { lastFrostDate?: string; firstFrostDate?: string };
}) {
  const pairs = useLiveQuery(() => listPlantingsWithCrops(bed.id), [bed.id]);
  const [pickerCell, setPickerCell] = useState<{ x: number; y: number } | null>(null);
  const [inspecting, setInspecting] = useState<PlantingWithCrop | null>(null);

  const cols = cellsAcross(bed.widthCm, cellSizeCm);
  const rows = cellsAcross(bed.lengthCm, cellSizeCm);

  if (!pairs) return null;

  // Build a flat cell map: key = "x,y" → planting info.
  type CellInfo = { pw: PlantingWithCrop; isLabel: boolean };
  const cellMap = new Map<string, CellInfo>();
  for (const pw of pairs) {
    const { x, y, w, h } = pw.planting.footprint;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        cellMap.set(`${x + dx},${y + dy}`, { pw, isLabel: dx === 0 && dy === 0 });
      }
    }
  }

  const existingFootprints = pairs.map((pw) => pw.planting.footprint);

  async function handleRemove(pw: PlantingWithCrop) {
    await deletePlanting(pw.planting.id);
    setInspecting(null);
  }

  return (
    <>
      {/* Bed dimensions label */}
      <p className="px-4 text-xs text-gray-400">
        {bed.widthCm} × {bed.lengthCm} cm · {cols} × {rows} cells · {cellSizeCm} cm/cell
      </p>

      {/* The grid */}
      <div className="px-4">
        <div
          className="grid gap-0.5"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          role="grid"
          aria-label={`${bed.name} planting grid`}
        >
          {Array.from({ length: rows }, (_, row) =>
            Array.from({ length: cols }, (_, col) => {
              const key = `${col},${row}`;
              const info = cellMap.get(key);
              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  aria-label={
                    info
                      ? `${info.pw.crop.name} at column ${col + 1} row ${row + 1}`
                      : `Empty cell column ${col + 1} row ${row + 1}`
                  }
                  onClick={() =>
                    info ? setInspecting(info.pw) : setPickerCell({ x: col, y: row })
                  }
                  className={[
                    'aspect-square rounded border text-center text-xs font-medium transition-colors',
                    info
                      ? `${familyColor(info.pw.crop.family)} ${info.isLabel ? '' : 'opacity-60'}`
                      : 'border-gray-200 bg-gray-50 hover:bg-green-50',
                  ].join(' ')}
                >
                  {info?.isLabel ? (
                    <span className="leading-tight block px-0.5 py-0.5 text-[10px] truncate">
                      {info.pw.crop.name}
                    </span>
                  ) : info ? null : (
                    <span className="text-gray-300">+</span>
                  )}
                </button>
              );
            }),
          )}
        </div>
      </div>

      {/* Planting count summary */}
      {pairs.length > 0 && (
        <div className="px-4">
          <div className="flex flex-wrap gap-2">
            {[...new Map(pairs.map((pw) => [pw.crop.id, pw])).values()].map((pw) => {
              const count = pairs
                .filter((p) => p.crop.id === pw.crop.id)
                .reduce((s, p) => s + p.planting.plantCount, 0);
              return (
                <span
                  key={pw.crop.id}
                  className={`rounded-full border px-2 py-0.5 text-xs ${familyColor(pw.crop.family)}`}
                >
                  {pw.crop.name} × {count}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Crop picker tray */}
      {pickerCell && (
        <CropPickerSheet
          cell={pickerCell}
          existingFootprints={existingFootprints}
          cellSizeCm={cellSizeCm}
          cols={cols}
          rows={rows}
          frostDates={garden}
          onClose={() => setPickerCell(null)}
          onPlace={async (crop, footprint, plantCount, method) => {
            await createPlanting({ bedId: bed.id, cropId: crop.id, footprint, plantCount, startMethod: method });
            setPickerCell(null);
          }}
        />
      )}

      {/* Planting detail sheet */}
      {inspecting && (
        <Sheet title={inspecting.crop.name} onClose={() => setInspecting(null)}>
          <PlantingDetail
            pw={inspecting}
            onRemove={() => void handleRemove(inspecting)}
          />
        </Sheet>
      )}
    </>
  );
}

// ── Crop picker sheet ─────────────────────────────────────────────────────────

function CropPickerSheet({
  cell,
  existingFootprints,
  cellSizeCm,
  cols,
  rows,
  frostDates,
  onClose,
  onPlace,
}: {
  cell: { x: number; y: number };
  existingFootprints: { x: number; y: number; w: number; h: number }[];
  cellSizeCm: number;
  cols: number;
  rows: number;
  frostDates?: { lastFrostDate?: string; firstFrostDate?: string };
  onClose: () => void;
  onPlace: (
    crop: Crop,
    footprint: { x: number; y: number; w: number; h: number },
    plantCount: number,
    method: import('../data/types').StartMethod,
  ) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const crops = useLiveQuery(() => listCrops(), []);
  const [placing, setPlacing] = useState(false);

  const q = query.toLowerCase();
  const filtered = crops?.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.family.toLowerCase().includes(q) ||
      (c.variety ?? '').toLowerCase().includes(q),
  );

  async function place(crop: Crop) {
    const { w, h } = cropCellsNeeded(crop.spacingCm, cellSizeCm);
    const footprint = { x: cell.x, y: cell.y, w, h };

    // Clamp to grid bounds
    if (footprint.x + w > cols || footprint.y + h > rows) {
      alert(`"${crop.name}" doesn't fit here — the block would extend outside the bed.`);
      return;
    }
    if (isFootprintOccupied(footprint, existingFootprints)) {
      alert(`That space is already occupied.`);
      return;
    }

    const plantCount = blockCapacity(crop.spacingCm, cellSizeCm, w, h) || 1;
    const method = crop.startMethods[0];

    setPlacing(true);
    try {
      await onPlace(crop, footprint, plantCount, method);
    } finally {
      setPlacing(false);
    }
  }

  return (
    <Sheet title={`Add crop at (${cell.x + 1}, ${cell.y + 1})`} onClose={onClose}>
      <div className="space-y-3">
        <input
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search crops…"
          aria-label="Search crops"
          autoFocus
        />
        <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
          {filtered?.map((crop) => {
            const windows = frostDates
              ? plantingCalendar(crop.sowWindows, crop.daysToMaturity, frostDates, today)
              : [];
            const bestStatus = windows.find((w) => w.status === 'open')?.status
              ?? windows.find((w) => w.status === 'upcoming')?.status
              ?? windows[0]?.status;
            const { w, h } = cropCellsNeeded(crop.spacingCm, cellSizeCm);
            const fits = cell.x + w <= cols && cell.y + h <= rows;

            return (
              <li key={crop.id}>
                <button
                  type="button"
                  disabled={placing || !fits}
                  onClick={() => void place(crop)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 disabled:opacity-40"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {crop.name}
                      {w > 1 && (
                        <span className="ml-1 text-xs text-gray-400">{w}×{h} cells</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">{crop.family}</p>
                  </div>
                  {bestStatus && (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[bestStatus]}`}>
                      {bestStatus}
                    </span>
                  )}
                  {!fits && (
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      too big
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Sheet>
  );
}

// ── Planting detail ───────────────────────────────────────────────────────────

function PlantingDetail({ pw, onRemove }: { pw: PlantingWithCrop; onRemove: () => void }) {
  const { planting, crop } = pw;
  const { w, h } = planting.footprint;
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-gray-500">Family</dt>
        <dd className="text-gray-900">{crop.family}</dd>
        <dt className="text-gray-500">Plants</dt>
        <dd className="text-gray-900">{planting.plantCount}</dd>
        <dt className="text-gray-500">Block</dt>
        <dd className="text-gray-900">{w}×{h} cells</dd>
        <dt className="text-gray-500">Days to maturity</dt>
        <dd className="text-gray-900">{crop.daysToMaturity[0]}–{crop.daysToMaturity[1]}</dd>
        <dt className="text-gray-500">Start method</dt>
        <dd className="text-gray-900">{METHOD_LABEL[planting.startMethod]}</dd>
      </dl>
      <button
        type="button"
        onClick={onRemove}
        className="w-full rounded-xl border border-red-300 py-2.5 text-sm font-semibold text-red-600"
      >
        Remove from bed
      </button>
    </div>
  );
}

// ── Calendar view ─────────────────────────────────────────────────────────────

function CalendarView({
  bed,
  garden,
}: {
  bed: Bed;
  garden?: { lastFrostDate?: string; firstFrostDate?: string };
}) {
  const pairs = useLiveQuery(() => listPlantingsWithCrops(bed.id), [bed.id]);

  if (!pairs) return null;

  if (pairs.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-sm text-gray-500">
        Place crops in the grid to see their sow windows here.
      </div>
    );
  }

  // Deduplicate by crop.
  const unique = [...new Map(pairs.map((pw) => [pw.crop.id, pw])).values()];
  const frostDates = garden ?? {};

  return (
    <div className="divide-y divide-gray-100 px-4">
      {unique.map(({ crop }) => {
        const windows = plantingCalendar(crop.sowWindows, crop.daysToMaturity, frostDates, today);
        return (
          <div key={crop.id} className="py-3">
            <p className="mb-2 font-medium text-gray-900">{crop.name}</p>
            {windows.length === 0 ? (
              <p className="text-xs text-gray-400">No frost dates set — add them in Settings.</p>
            ) : (
              <ul className="space-y-1.5">
                {windows.map((entry, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[entry.status]}`}
                    >
                      {entry.status === 'too-late' ? 'too late' : entry.status}
                    </span>
                    <div className="text-sm text-gray-700">
                      <span className="font-medium">{METHOD_LABEL[entry.method]}</span>
                      {': '}
                      {fmtDate(entry.opensDate)}
                      {' – '}
                      {fmtDate(entry.closesDate)}
                      {entry.harvestFrom && entry.harvestTo && (
                        <span className="ml-2 text-xs text-gray-500">
                          harvest {fmtDate(entry.harvestFrom)}–{fmtDate(entry.harvestTo)}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Catalog tab (M2 browser, now a tab) ──────────────────────────────────────

function CatalogTab() {
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
    <div className="pt-3">
      <div className="px-4 pb-3">
        <input
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600"
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
                <section key={family} className="mb-3">
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
          <CropDetailSheet
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

function CropList({ crops, onSelect }: { crops: Crop[]; onSelect: (c: Crop) => void }) {
  return (
    <ul className="divide-y divide-gray-100">
      {crops.map((crop) => (
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
              {cropConfidence(crop) === 'precise' && (
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
      ))}
    </ul>
  );
}

function CropDetailSheet({
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
        {confidence === 'precise' ? (
          <Chip variant="green">GDD-tuned</Chip>
        ) : (
          <Chip>Day-range estimate</Chip>
        )}
        {crop.photoperiodSensitive && <Chip variant="amber">Daylength sensitive</Chip>}
        {crop.isCustom && <Chip variant="blue">My variety</Chip>}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-gray-500">Spacing</dt>
        <dd className="text-gray-900">{crop.spacingCm} cm</dd>
        <dt className="text-gray-500">Germination</dt>
        <dd className="text-gray-900">{crop.daysToGerminate[0]}–{crop.daysToGerminate[1]} days</dd>
        <dt className="text-gray-500">Days to maturity</dt>
        <dd className="text-gray-900">{crop.daysToMaturity[0]}–{crop.daysToMaturity[1]}</dd>
        {crop.gddToMaturity && (
          <>
            <dt className="text-gray-500">GDD to maturity</dt>
            <dd className="text-gray-900">{crop.gddToMaturity}</dd>
          </>
        )}
        <dt className="text-gray-500">Frost tolerance</dt>
        <dd className="text-gray-900 capitalize">{crop.frostTolerance}</dd>
        <dt className="text-gray-500">Start method</dt>
        <dd className="text-gray-900">{crop.startMethods.map((m) => METHOD_LABEL[m]).join(', ')}</dd>
      </dl>
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

// ── Shared primitives ─────────────────────────────────────────────────────────

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

function Chip({
  children,
  variant = 'gray',
}: {
  children: React.ReactNode;
  variant?: 'gray' | 'green' | 'amber' | 'blue';
}) {
  const cls = {
    gray: 'bg-gray-100 text-gray-600',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls[variant]}`}>
      {children}
    </span>
  );
}
