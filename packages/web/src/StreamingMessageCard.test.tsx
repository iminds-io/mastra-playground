// @vitest-environment jsdom
// ABOUTME: Tests for the streaming message card
// ABOUTME: Validates dashed border, typing indicator, cursor, and mind identity

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StreamingMessageCard } from './StreamingMessageCard';

describe('StreamingMessageCard', () => {
  afterEach(cleanup);

  it('renders the mind avatar', () => {
    render(<StreamingMessageCard text="" mindName="Claude" mindEmoji="🤖" />);
    expect(screen.getByText('🤖')).toBeTruthy();
  });

  it('shows "typing..." indicator when text is empty', () => {
    render(<StreamingMessageCard text="" mindName="Claude" mindEmoji="🤖" />);
    expect(screen.getByText(/typing/i)).toBeTruthy();
  });

  it('renders streaming text with a blinking cursor', () => {
    const { container } = render(<StreamingMessageCard text="Working through" mindName="Claude" mindEmoji="🤖" />);
    expect(screen.getByText(/Working through/)).toBeTruthy();
    expect(container.querySelector('.streaming-cursor')).toBeTruthy();
  });

  it('applies the dashed border class', () => {
    const { container } = render(<StreamingMessageCard text="hello" mindName="Claude" mindEmoji="🤖" />);
    expect(container.querySelector('.message-card-streaming')).toBeTruthy();
  });

  it('shows the mind name', () => {
    render(<StreamingMessageCard text="hello" mindName="Claude" mindEmoji="🤖" />);
    expect(screen.getByText('Claude')).toBeTruthy();
  });
});
