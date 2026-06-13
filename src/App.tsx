import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import Today from './screens/Today';
import Planner from './screens/Planner';
import Beds from './screens/Beds';
import Settings from './screens/Settings';

export default function App() {
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
