// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConnectionBanner } from './ConnectionBanner';

describe('ConnectionBanner', () => {
  it('renders nothing while connected', () => {
    const { container } = render(<ConnectionBanner status="connected" />);
    expect(container.textContent).toBe('');
  });

  it('renders reconnecting state', () => {
    render(<ConnectionBanner status="reconnecting" />);
    expect(screen.getByRole('status').textContent).toContain('Reconnecting');
  });

  it('renders offline state with retry', () => {
    const onRetry = vi.fn();
    render(<ConnectionBanner status="offline" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
