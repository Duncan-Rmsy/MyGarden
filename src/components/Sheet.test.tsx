import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Sheet from './Sheet';

describe('Sheet', () => {
  it('renders title and children', () => {
    render(<Sheet title="Test Sheet" onClose={vi.fn()}>Hello</Sheet>);
    expect(screen.getByRole('heading', { name: 'Test Sheet' })).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn();
    render(<Sheet title="X" onClose={onClose}><span /></Sheet>);
    // The backdrop is an aria-hidden div; click the dialog's backdrop element
    const backdrop = document.querySelector('[aria-hidden="true"]') as HTMLElement;
    backdrop.click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
