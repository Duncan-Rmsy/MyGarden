import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import ScreenHeader from '../components/ScreenHeader';
import BedForm, { type BedFormValues } from '../components/BedForm';
import { getGarden, listBeds, createBed, updateBed, deleteBed } from '../data/repo';
import type { Bed } from '../data/types';

const SUN_LABEL: Record<Bed['sunExposure'], string> = {
  full: 'Full sun',
  partial: 'Partial sun',
  shade: 'Shade',
};

const CULTIVATION_LABEL: Record<Bed['cultivationMethod'], string> = {
  'no-dig': 'No-dig',
  'in-ground': 'In-ground',
  'raised-bed': 'Raised bed',
  container: 'Container',
};

type Editor = { mode: 'add' } | { mode: 'edit'; bed: Bed } | null;

export default function Beds() {
  const garden = useLiveQuery(() => getGarden(), []);
  const beds = useLiveQuery(
    () => (garden ? listBeds(garden.id) : Promise.resolve([])),
    [garden?.id],
  );
  const [editor, setEditor] = useState<Editor>(null);

  async function save(values: BedFormValues) {
    if (!garden) return;
    if (editor?.mode === 'edit') {
      await updateBed(editor.bed.id, values);
    } else {
      await createBed({ gardenId: garden.id, ...values });
    }
    setEditor(null);
  }

  async function remove(bed: Bed) {
    if (confirm(`Delete "${bed.name}"? This can't be undone.`)) {
      await deleteBed(bed.id);
    }
  }

  return (
    <div>
      <ScreenHeader title="Beds" subtitle="Your growing spaces" />
      <div className="space-y-3 px-4">
        {beds?.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
            <p className="text-3xl" aria-hidden>
              🌱
            </p>
            <p className="mt-2 text-sm text-gray-600">No beds yet. Add your first growing space.</p>
          </div>
        )}

        {beds?.map((bed) => (
          <div
            key={bed.id}
            className="flex items-center justify-between rounded-2xl border border-gray-200 p-4"
          >
            <div>
              <p className="font-semibold text-gray-900">{bed.name}</p>
              <p className="mt-0.5 text-sm text-gray-500">
                {bed.widthCm} × {bed.lengthCm} cm · {SUN_LABEL[bed.sunExposure]} ·{' '}
                {CULTIVATION_LABEL[bed.cultivationMethod]}
              </p>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setEditor({ mode: 'edit', bed })}
                className="rounded-lg px-2 py-1 text-sm font-medium text-green-700"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => void remove(bed)}
                className="rounded-lg px-2 py-1 text-sm font-medium text-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setEditor({ mode: 'add' })}
          className="w-full rounded-2xl border border-green-600 bg-green-50 py-3 text-sm font-semibold text-green-700"
        >
          + Add bed
        </button>
      </div>

      {editor && (
        <Sheet
          title={editor.mode === 'edit' ? 'Edit bed' : 'Add bed'}
          onClose={() => setEditor(null)}
        >
          <BedForm
            initial={editor.mode === 'edit' ? editor.bed : undefined}
            submitLabel={editor.mode === 'edit' ? 'Save changes' : 'Add bed'}
            onSubmit={(values) => void save(values)}
            onCancel={() => setEditor(null)}
          />
        </Sheet>
      )}
    </div>
  );
}

/** A bottom slide-up sheet for the bed form (mobile-first, PLAN.md §4a). */
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
      <div className="relative mx-auto w-full max-w-md rounded-t-3xl bg-white p-5 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-gray-900">{title}</h2>
        {children}
      </div>
    </div>
  );
}
