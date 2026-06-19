import { useState } from 'react';
import Sheet from './Sheet';
import { addObservation, updatePlanting } from '../data/repo';
import type { Planting, Stage } from '../data/types';
import type { TwinState } from '../domain/twin';

const OBSERVABLE_STAGES: Stage[] = [
  'germinated', 'seedling', 'vegetative', 'flowering', 'fruiting', 'harvest',
];

const STAGE_LABEL: Record<string, string> = {
  germinated: 'Germinated',
  seedling: 'Seedling',
  vegetative: 'Vegetative growth',
  flowering: 'Flowering',
  fruiting: 'Fruiting',
  harvest: 'Ready to harvest',
};

type SheetState = 'selecting' | 'saving';

export default function ObservationSheet({
  planting,
  twinState,
  onClose,
}: {
  planting: Planting;
  twinState: TwinState | null;
  onClose: () => void;
}) {
  const [sheetState, setSheetState] = useState<SheetState>('selecting');
  const [selected, setSelected] = useState<Stage | null>(twinState?.stage ?? null);

  async function handleConfirm() {
    if (!selected) return;
    setSheetState('saving');
    const today = new Date().toISOString().slice(0, 10);
    await addObservation({
      plantingId: planting.id,
      kind: 'stage_reached',
      at: today,
      stage: selected,
      twinProjectedDate: twinState?.projectedHarvestDate,
      deltaDays: twinState?.daysToHarvest,
    });
    await updatePlanting(planting.id, { currentStage: selected });
    onClose();
  }

  return (
    <Sheet title="Record stage" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {OBSERVABLE_STAGES.map((stage) => (
            <button
              key={stage}
              type="button"
              onClick={() => setSelected(stage)}
              className={[
                'rounded-xl border px-3 py-2 text-sm text-left',
                selected === stage
                  ? 'border-green-600 bg-green-50 text-green-700 font-medium'
                  : 'border-gray-200 text-gray-700',
              ].join(' ')}
            >
              {STAGE_LABEL[stage]}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={!selected || sheetState === 'saving'}
          onClick={() => void handleConfirm()}
          className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {sheetState === 'saving' ? 'Saving…' : 'Save observation'}
        </button>
      </div>
    </Sheet>
  );
}
