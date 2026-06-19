// Render smoke test (TESTING.md DoD — new screens get at least a render test). The
// drag/tap placement itself is pointer-driven and belongs to the browser/E2E tier; this
// only asserts the screen mounts and its tabs render against an empty database.
//
// M4-S4 note: Planner now calls getWeatherForGarden (returns empty arrays for empty DB)
// and useForecastRefresh (fires a fetchForecast network call). The network call will fail
// silently in jsdom since fetch is unavailable — the hook swallows all errors. Tests
// continue to pass because the "Add a bed in the..." message still shows for an empty DB.
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Planner from './Planner';

describe('Planner screen', () => {
  it('renders the heading and the layout/catalog tabs', async () => {
    render(<Planner />);
    expect(await screen.findByRole('heading', { name: 'Planner' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'layout' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'catalog' })).toBeInTheDocument();
    // With no garden/beds yet, the layout tab prompts the user to add a bed first.
    expect(await screen.findByText(/Add a bed in the/i)).toBeInTheDocument();
  });
});
