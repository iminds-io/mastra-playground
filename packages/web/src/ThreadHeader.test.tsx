// @vitest-environment jsdom
// ABOUTME: Tests for the thread detail header
// ABOUTME: Validates context line content and close button behavior

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThreadHeader } from './ThreadHeader';

describe('ThreadHeader', () => {
  afterEach(cleanup);

  const defaultProps = {
    authorName: 'Alice Chen',
    channelName: 'engineering',
    createdAt: '2026-04-24T14:30:00.000Z',
    onClose: vi.fn(),
  };

  it('renders the "Thread" eyebrow label', () => {
    render(<ThreadHeader {...defaultProps} />);
    expect(screen.getByText('Thread')).toBeTruthy();
  });

  it('renders the context line with author name', () => {
    render(<ThreadHeader {...defaultProps} />);
    expect(screen.getByText(/Started by Alice Chen/)).toBeTruthy();
  });

  it('renders the channel name with # prefix', () => {
    render(<ThreadHeader {...defaultProps} />);
    expect(screen.getByText(/#engineering/)).toBeTruthy();
  });

  it('renders the close button', () => {
    render(<ThreadHeader {...defaultProps} />);
    expect(screen.getByRole('button', { name: /close/i })).toBeTruthy();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<ThreadHeader {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not render a close button when onClose is not provided', () => {
    render(<ThreadHeader authorName="Alice Chen" channelName="engineering" createdAt="2026-04-24T14:30:00.000Z" />);
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
  });
});
