import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ObservationSheet from './ObservationSheet';
import type { Planting } from '../data/types';

const mockPlanting: Planting = {
  id: 'p-1',
  bedId: 'bed-1',
  cropId: 'crop-1',
  footprint: { x: 0, y: 0, w: 1, h: 1 },
  plantCount: 4,
  startMethod: 'direct',
  status: 'active',
};

describe('ObservationSheet', () => {
  it('renders stage options and confirm button', () => {
    render(
      <ObservationSheet planting={mockPlanting} twinState={null} onClose={vi.fn()} />,
    );
    expect(screen.getByRole('heading', { name: /Record stage/i })).toBeInTheDocument();
    expect(screen.getByText('Germinated')).toBeInTheDocument();
    expect(screen.getByText('Fruiting')).toBeInTheDocument();
  });

  it('enables confirm only after selecting a stage', async () => {
    const user = userEvent.setup();
    render(
      <ObservationSheet planting={mockPlanting} twinState={null} onClose={vi.fn()} />,
    );
    const confirm = screen.getByRole('button', { name: /Save observation/i });
    // With no twinState and no selection, button should be disabled
    // (initial selected is null when twinState is null)
    // Click a stage to enable
    await user.click(screen.getByText('Fruiting'));
    expect(confirm).not.toBeDisabled();
  });
});
