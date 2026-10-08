import React from 'react';
import { render, screen } from '@testing-library/react';
import { DEMO_BADGE_TEXT, DemoBadge } from '../demo';

describe('DemoBadge', () => {
  it('renders the pill with the tooltip text as label when visible and wide enough', () => {
    render(<DemoBadge visible width={400} />);
    const badge = screen.getByTestId('impact-demo-badge');
    expect(badge).toHaveTextContent('Demo data');
    expect(badge).toHaveAttribute('aria-label', DEMO_BADGE_TEXT);
  });
  it('is hidden when not visible or when the panel is narrower than 160 px', () => {
    const { rerender } = render(<DemoBadge visible={false} width={400} />);
    expect(screen.queryByTestId('impact-demo-badge')).toBeNull();
    rerender(<DemoBadge visible width={159} />);
    expect(screen.queryByTestId('impact-demo-badge')).toBeNull();
    rerender(<DemoBadge visible width={160} />);
    expect(screen.getByTestId('impact-demo-badge')).toBeInTheDocument();
  });
});
