import ScreenHeader from '../components/ScreenHeader';

export default function Today() {
  return (
    <div>
      <ScreenHeader title="Today" subtitle="What your garden needs right now" />
      <div className="px-4">
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
          <p className="text-3xl" aria-hidden>
            🌤️
          </p>
          <p className="mt-2 text-sm text-gray-600">
            Your task feed will appear here once the digital twin is running.
          </p>
        </div>
      </div>
    </div>
  );
}
