import { useState } from 'react';
import type { SunExposure } from '../data/types';

export interface BedFormValues {
  name: string;
  widthCm: number;
  lengthCm: number;
  sunExposure: SunExposure;
}

interface BedFormProps {
  initial?: Partial<BedFormValues>;
  submitLabel: string;
  onSubmit: (values: BedFormValues) => void;
  onCancel?: () => void;
}

const SUN_OPTIONS: { value: SunExposure; label: string }[] = [
  { value: 'full', label: 'Full sun' },
  { value: 'partial', label: 'Partial' },
  { value: 'shade', label: 'Shade' },
];

const inputClass =
  'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600';

/** Shared bed editor used by onboarding's first bed and the Beds screen CRUD. */
export default function BedForm({ initial, submitLabel, onSubmit, onCancel }: BedFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [widthCm, setWidthCm] = useState(initial?.widthCm?.toString() ?? '');
  const [lengthCm, setLengthCm] = useState(initial?.lengthCm?.toString() ?? '');
  const [sunExposure, setSunExposure] = useState<SunExposure>(initial?.sunExposure ?? 'full');

  const width = Number(widthCm);
  const length = Number(lengthCm);
  const valid = name.trim().length > 0 && width > 0 && length > 0;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSubmit({ name: name.trim(), widthCm: width, lengthCm: length, sunExposure });
      }}
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="bed-name">
          Bed name
        </label>
        <input
          id="bed-name"
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Back bed"
          autoComplete="off"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="bed-width">
            Width (cm)
          </label>
          <input
            id="bed-width"
            className={inputClass}
            type="number"
            inputMode="numeric"
            min={1}
            value={widthCm}
            onChange={(e) => setWidthCm(e.target.value)}
            placeholder="120"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="bed-length">
            Length (cm)
          </label>
          <input
            id="bed-length"
            className={inputClass}
            type="number"
            inputMode="numeric"
            min={1}
            value={lengthCm}
            onChange={(e) => setLengthCm(e.target.value)}
            placeholder="240"
          />
        </div>
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium text-gray-700">Sun exposure</span>
        <div className="flex gap-2">
          {SUN_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSunExposure(opt.value)}
              className={[
                'flex-1 rounded-xl border px-2 py-2 text-sm font-medium transition-colors',
                sunExposure === opt.value
                  ? 'border-green-600 bg-green-50 text-green-700'
                  : 'border-gray-300 text-gray-600',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-semibold text-gray-600"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!valid}
          className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
