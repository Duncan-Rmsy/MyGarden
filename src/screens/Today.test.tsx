import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Today from './Today';

describe('Today screen', () => {
  it('renders the heading', () => {
    render(<Today />);
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
  });
});
