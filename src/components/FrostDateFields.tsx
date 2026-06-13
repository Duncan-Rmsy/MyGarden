// Editable last/first frost fields (PLAN.md §4c step 2). Derived dates are always
// presented as editable — gardeners know their own microclimate. Values are MM-DD
// strings; a <input type="date"> is anchored to a display year for a friendly picker.

const DISPLAY_YEAR = 2001; // non-leap, matches the canonical year frost dates are derived in

const inputClass =
  'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600';

function mmddToInputDate(mmdd: string): string {
  return mmdd ? `${DISPLAY_YEAR}-${mmdd}` : '';
}

function inputDateToMMDD(value: string): string {
  return value ? value.slice(5) : '';
}

interface FrostDateFieldsProps {
  lastFrost: string; // MM-DD, '' if unknown
  firstFrost: string;
  onChange: (next: { lastFrost: string; firstFrost: string }) => void;
}

export default function FrostDateFields({
  lastFrost,
  firstFrost,
  onChange,
}: FrostDateFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="last-frost">
          Last spring frost
        </label>
        <input
          id="last-frost"
          type="date"
          className={inputClass}
          value={mmddToInputDate(lastFrost)}
          onChange={(e) => onChange({ lastFrost: inputDateToMMDD(e.target.value), firstFrost })}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="first-frost">
          First autumn frost
        </label>
        <input
          id="first-frost"
          type="date"
          className={inputClass}
          value={mmddToInputDate(firstFrost)}
          onChange={(e) => onChange({ lastFrost, firstFrost: inputDateToMMDD(e.target.value) })}
        />
      </div>
    </div>
  );
}
