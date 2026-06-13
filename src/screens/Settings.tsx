import ScreenHeader from '../components/ScreenHeader';

export default function Settings() {
  return (
    <div>
      <ScreenHeader title="Settings" subtitle="Location, frost dates & notifications" />
      <div className="px-4">
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
          <p className="text-3xl" aria-hidden>
            ⚙️
          </p>
          <p className="mt-2 text-sm text-gray-600">
            Onboarding and garden settings arrive with milestone 1.
          </p>
        </div>
      </div>
    </div>
  );
}
