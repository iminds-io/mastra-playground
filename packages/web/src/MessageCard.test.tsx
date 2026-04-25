// @vitest-environment jsdom
// ABOUTME: Tests for the MessageCard component
// ABOUTME: Validates avatar, author, timestamp, markdown rendering, and role-specific styling

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MessageCard } from './MessageCard';

describe('MessageCard', () => {
  afterEach(cleanup);

  const humanMessage = {
    id: 'msg-1',
    role: 'user',
    text: 'Hello **world**',
    createdAt: '2026-04-24T14:30:00.000Z',
    authorName: 'Alice Chen',
  };

  const mindMessage = {
    id: 'msg-2',
    role: 'assistant',
    text: 'I can help with that.',
    createdAt: '2026-04-24T14:31:00.000Z',
    authorName: 'Claude',
    authorEmoji: '🤖',
  };

  it('renders the author name', () => {
    render(<MessageCard message={humanMessage} />);
    expect(screen.getByText('Alice Chen')).toBeTruthy();
  });

  it('renders the avatar with initials for human messages', () => {
    render(<MessageCard message={humanMessage} />);
    expect(screen.getByText('AC')).toBeTruthy();
  });

  it('renders the avatar with emoji for mind messages', () => {
    render(<MessageCard message={mindMessage} />);
    expect(screen.getByText('🤖')).toBeTruthy();
  });

  it('renders the message body with markdown', () => {
    const { container } = render(<MessageCard message={humanMessage} />);
    expect(container.querySelector('strong')?.textContent).toBe('world');
  });

  it('renders a timestamp', () => {
    const { container } = render(<MessageCard message={humanMessage} />);
    expect(container.querySelector('.message-timestamp')).toBeTruthy();
  });

  it('applies mind-specific name styling for mind messages', () => {
    const { container } = render(<MessageCard message={mindMessage} />);
    expect(container.querySelector('.message-author-mind')).toBeTruthy();
  });

  it('does not apply mind styling to human messages', () => {
    const { container } = render(<MessageCard message={humanMessage} />);
    expect(container.querySelector('.message-author-mind')).toBeNull();
  });

  it('renders current-user avatar variant when isCurrentUser is true', () => {
    const { container } = render(<MessageCard message={humanMessage} isCurrentUser />);
    expect(container.querySelector('.avatar-ring-primary')).toBeTruthy();
  });
});
