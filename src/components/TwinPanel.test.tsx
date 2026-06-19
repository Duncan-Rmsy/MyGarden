import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TwinPanel from './TwinPanel';
import type { TwinState } from '../domain/twin';

const baseTwinState: TwinState = {
  stage: 'vegetative',
  gddAccumulated: 250,
  gddToNextStage: 150,
  projectedHarvestDate: '2026-08-15',
  daysToHarvest: 57,
  confidence: 'high',
  usingGdd: true,
};

describe('TwinPanel', () => {
  it('renders stage label and confidence', () => {
    render(<TwinPanel twinState={baseTwinState} onObserve={vi.fn()} />);
    expect(screen.getByText(/Vegetative/)).toBeInTheDocument();
    expect(screen.getByText(/high confidence/i)).toBeInTheDocument();
  });

  it('renders harvest projection when provided', () => {
    render(<TwinPanel twinState={baseTwinState} onObserve={vi.fn()} />);
    expect(screen.getByText(/Projected harvest/i)).toBeInTheDocument();
    expect(screen.getByText(/57 days/)).toBeInTheDocument();
  });

  it('hides GDD bar when usingGdd is false', () => {
    render(<TwinPanel twinState={{ ...baseTwinState, usingGdd: false }} onObserve={vi.fn()} />);
    expect(screen.queryByText(/GDD/)).toBeNull();
  });

  it('calls onObserve when button clicked', async () => {
    const onObserve = vi.fn();
    const { getByRole } = render(<TwinPanel twinState={baseTwinState} onObserve={onObserve} />);
    getByRole('button', { name: /Mark stage/i }).click();
    expect(onObserve).toHaveBeenCalledOnce();
  });
});
