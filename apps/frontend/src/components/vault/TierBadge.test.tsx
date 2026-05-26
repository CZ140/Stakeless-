import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TierBadge } from './TierBadge';

// Smoke test: proves the React + jsdom + shared-package wiring renders, using a
// pure presentational component that reads the shared TIERS table.
describe('<TierBadge>', () => {
  it('shows the tier name when labelled (level 2 = Gold)', () => {
    render(<TierBadge level={2} label />);
    expect(screen.getByText('Gold')).toBeInTheDocument();
  });

  it('renders compactly without a label and exposes the tier via title', () => {
    const { container } = render(<TierBadge level={0} />);
    expect(screen.queryByText('Bronze')).not.toBeInTheDocument();
    expect(container.querySelector('.tier-badge')).toHaveAttribute('title', 'Bronze tier');
  });
});
