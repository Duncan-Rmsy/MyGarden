import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/', label: 'Today', icon: '☀️' },
  { to: '/planner', label: 'Planner', icon: '🪴' },
  { to: '/beds', label: 'Beds', icon: '🌱' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-gray-200 bg-white/95 backdrop-blur">
      <ul className="flex">
        {tabs.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                [
                  'flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors',
                  isActive ? 'text-green-700' : 'text-gray-400',
                ].join(' ')
              }
            >
              <span className="text-lg" aria-hidden>
                {tab.icon}
              </span>
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
