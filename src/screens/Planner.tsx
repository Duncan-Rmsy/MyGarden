import ScreenHeader from '../components/ScreenHeader';

export default function Planner() {
  return (
    <div>
      <ScreenHeader title="Planner" subtitle="Lay out your beds and choose what to plant" />
      <div className="px-4">
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
          <p className="text-3xl" aria-hidden>
            🪴
          </p>
          <p className="mt-2 text-sm text-gray-600">
            The to-scale bed grid and crop picker land in a later milestone.
          </p>
        </div>
      </div>
    </div>
  );
}
