// @vitest-environment jsdom
// ABOUTME: Tests for the ThreadCard component — rich thread card display
// ABOUTME: Validates author name, timestamp, preview, reply count, and selected state

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChannelFeedPost } from './api';
import { ThreadCard } from './ThreadCard';

const basePost: ChannelFeedPost = {
  threadId: 'thread-1',
  rootMessageId: 'msg-1',
  rootMessageText: 'Deploy the auth fix to staging before the freeze window closes tomorrow.',
  rootMessageRole: 'user',
  replyCount: 4,
  lastMessageAt: '2026-04-23T14:28:00.000Z',
  createdAt: '2026-04-23T14:00:00.000Z',
};

const now = new Date('2026-04-23T14:30:00.000Z');

describe('ThreadCard', () => {
  afterEach(cleanup);

  it('renders the author name derived from rootMessageRole', () => {
    render(<ThreadCard post={basePost} isSelected={false} now={now} onClick={vi.fn()} />);

    expect(screen.getByText('You')).toBeTruthy();
  });

  it('renders a capitalized role name for non-user roles', () => {
    render(
      <ThreadCard
        post={{ ...basePost, rootMessageRole: 'assistant' }}
        isSelected={false}
        now={now}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText('Assistant')).toBeTruthy();
  });

  it('renders the formatted creation timestamp', () => {
    render(<ThreadCard post={basePost} isSelected={false} now={now} onClick={vi.fn()} />);

    expect(screen.getByText('30 min ago')).toBeTruthy();
  });

  it('renders the root message text', () => {
    render(<ThreadCard post={basePost} isSelected={false} now={now} onClick={vi.fn()} />);

    expect(screen.getByText('Deploy the auth fix to staging before the freeze window closes tomorrow.')).toBeTruthy();
  });

  it('renders the reply count', () => {
    render(<ThreadCard post={basePost} isSelected={false} now={now} onClick={vi.fn()} />);

    expect(screen.getByText(/4 replies/)).toBeTruthy();
  });

  it('renders "1 reply" for singular', () => {
    render(<ThreadCard post={{ ...basePost, replyCount: 1 }} isSelected={false} now={now} onClick={vi.fn()} />);

    expect(screen.getByText(/1 reply\b/)).toBeTruthy();
  });

  it('renders the relative last-activity time', () => {
    render(<ThreadCard post={basePost} isSelected={false} now={now} onClick={vi.fn()} />);

    expect(screen.getByText('2 min ago')).toBeTruthy();
  });

  it('calls onClick when the card is clicked', () => {
    const handleClick = vi.fn();
    render(<ThreadCard post={basePost} isSelected={false} now={now} onClick={handleClick} />);

    fireEvent.click(screen.getByRole('button', { name: /open thread for deploy the auth fix/i }));

    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('applies active styling when selected', () => {
    render(<ThreadCard post={basePost} isSelected now={now} onClick={vi.fn()} />);

    const button = screen.getByRole('button', { name: /open thread for deploy the auth fix/i });
    expect(button.className).toContain('feed-card-active');
  });

  it('does not apply active styling when not selected', () => {
    render(<ThreadCard post={basePost} isSelected={false} now={now} onClick={vi.fn()} />);

    const button = screen.getByRole('button', { name: /open thread for deploy the auth fix/i });
    expect(button.className).not.toContain('feed-card-active');
  });

  it('hides reply count section when replyCount is 0', () => {
    render(
      <ThreadCard
        post={{ ...basePost, replyCount: 0, lastMessageAt: null }}
        isSelected={false}
        now={now}
        onClick={vi.fn()}
      />,
    );

    expect(screen.queryByText(/replies?/)).toBeNull();
  });
});
