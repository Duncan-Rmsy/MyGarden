import type { TwinState } from '../domain/twin';

const STAGE_EMOJI: Record<string, string> = {
  seed: '🌱',
  germinated: '🌱',
  seedling: '🪴',
  vegetative: '🌿',
  flowering: '🌸',
  fruiting: '🍅',
  harvest: '🌾',
  done: '✅',
};

const STAGE_LABEL_FULL: Record<string, string> = {
  seed: 'Seed',
  germinated: 'Germinated',
  seedling: 'Seedling',
  vegetative: 'Vegetative',
  flowering: 'Flowering',
  fruiting: 'Fruiting',
  harvest: 'Ready to harvest',
  done: 'Done',
};

const CONFIDENCE_STYLE = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-100 text-gray-500',
};

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function TwinPanel({
  twinState,
  onObserve,
}: {
  twinState: TwinState;
  onObserve: () => void;
}) {
  return (
    <div className="rounded-xl border border-green-200 bg-green-50 p-3 space-y-2">
      {/* Stage row */}
      <div className="flex items-center justify-between">
        <span className="font-medium text-gray-900">
          {STAGE_EMOJI[twinState.stage]} {STAGE_LABEL_FULL[twinState.stage]}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CONFIDENCE_STYLE[twinState.confidence]}`}>
          {twinState.confidence} confidence
        </span>
      </div>

      {/* GDD progress bar */}
      {twinState.usingGdd && twinState.gddToNextStage !== undefined && (() => {
        const pct = Math.min(100, Math.round(
          (twinState.gddAccumulated / (twinState.gddAccumulated + twinState.gddToNextStage)) * 100
        ));
        return (
          <div className="space-y-0.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-green-200">
              <div
                className="h-full rounded-full bg-green-600"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">{twinState.gddAccumulated | 0} GDD</p>
          </div>
        );
      })()}

      {/* Harvest projection */}
      {twinState.projectedHarvestDate && (
        <p className="text-sm text-gray-600">
          Projected harvest:{' '}
          <span className="font-medium text-gray-900">
            {fmtDate(twinState.projectedHarvestDate)}
          </span>
          {twinState.daysToHarvest !== undefined && (
            <span className="ml-1 text-xs text-gray-500">({twinState.daysToHarvest} days)</span>
          )}
        </p>
      )}

      {/* Observe button */}
      <button
        type="button"
        onClick={onObserve}
        className="w-full rounded-xl border border-green-600 py-2 text-sm font-semibold text-green-700"
      >
        Mark stage reached
      </button>
    </div>
  );
}
