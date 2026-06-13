import ScreenHeader from '../components/ScreenHeader';

export default function Beds() {
  return (
    <div>
      <ScreenHeader title="Beds" subtitle="Your growing spaces" />
      <div className="px-4">
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
          <p className="text-3xl" aria-hidden>
            🌱
          </p>
          <p className="mt-2 text-sm text-gray-600">
            Beds and their plantings will be listed here.
          </p>
        </div>
      </div>
    </div>
  );
}
