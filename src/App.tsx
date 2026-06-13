import { Navigate, Route, Routes } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import AppLayout from './components/AppLayout';
import Today from './screens/Today';
import Planner from './screens/Planner';
import Beds from './screens/Beds';
import Settings from './screens/Settings';
import Onboarding from './screens/Onboarding';
import { getGarden } from './data/repo';

export default function App() {
  // undefined = still loading from IndexedDB; null = no garden yet (show onboarding).
  const garden = useLiveQuery(async () => (await getGarden()) ?? null, [], undefined);

  if (garden === undefined) {
    return <div className="flex h-full items-center justify-center text-gray-400">Loading…</div>;
  }

  if (garden === null) {
    return <Onboarding />;
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Today />} />
        <Route path="/planner" element={<Planner />} />
        <Route path="/beds" element={<Beds />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
