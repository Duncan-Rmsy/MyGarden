import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import BedForm from './BedForm';

describe('BedForm', () => {
  it('disables submit until name and positive dimensions are provided', async () => {
    const onSubmit = vi.fn();
    render(<BedForm submitLabel="Add bed" onSubmit={onSubmit} />);
    const submit = screen.getByRole('button', { name: 'Add bed' });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Bed name'), 'Back bed');
    await userEvent.type(screen.getByLabelText('Width (cm)'), '120');
    await userEvent.type(screen.getByLabelText('Length (cm)'), '240');
    expect(submit).toBeEnabled();
  });

  it('submits trimmed name and numeric dimensions', async () => {
    const onSubmit = vi.fn();
    render(<BedForm submitLabel="Add bed" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Bed name'), '  Salad bed  ');
    await userEvent.type(screen.getByLabelText('Width (cm)'), '90');
    await userEvent.type(screen.getByLabelText('Length (cm)'), '180');
    await userEvent.click(screen.getByRole('button', { name: 'Add bed' }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Salad bed',
      widthCm: 90,
      lengthCm: 180,
      sunExposure: 'full',
    });
  });

  it('prefills from initial values for editing', () => {
    render(
      <BedForm
        submitLabel="Save changes"
        initial={{ name: 'Herb bed', widthCm: 60, lengthCm: 60, sunExposure: 'partial' }}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Bed name')).toHaveValue('Herb bed');
    expect(screen.getByLabelText('Width (cm)')).toHaveValue(60);
  });
});
