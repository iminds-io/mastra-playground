// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FailedMessageActions } from './FailedMessageActions';

describe('FailedMessageActions', () => {
  it('calls retry and discard callbacks', () => {
    const onRetry = vi.fn();
    const onDiscard = vi.fn();

    render(<FailedMessageActions onRetry={onRetry} onDiscard={onDiscard} />);

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    fireEvent.click(screen.getByRole('button', { name: /discard/i }));

    expect(onRetry).toHaveBeenCalledOnce();
    expect(onDiscard).toHaveBeenCalledOnce();
  });
});
