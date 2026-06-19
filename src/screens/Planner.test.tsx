// Render smoke test (TESTING.md DoD — new screens get at least a render test). The
// drag/tap placement itself is pointer-driven and belongs to the browser/E2E tier; this
// only asserts the screen mounts and its tabs render against an empty database.
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
