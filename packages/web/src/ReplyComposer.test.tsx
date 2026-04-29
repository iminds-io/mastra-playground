// @vitest-environment jsdom
// ABOUTME: Tests for the reply composer with mind mention chips
// ABOUTME: Validates textarea, chips, hint, and disabled behavior

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReplyComposer } from './ReplyComposer';

describe('ReplyComposer', () => {
  afterEach(cleanup);

  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    onKeyDown: vi.fn(),
    disabled: false,
    minds: [
      { name: 'Librarian', emoji: '📚' },
    ],
  };

  it('renders a textarea with placeholder', () => {
    render(<ReplyComposer {...defaultProps} />);
    expect(screen.getByPlaceholderText(/reply to this thread/i)).toBeTruthy();
  });

  it('renders mind mention chips', () => {
    render(<ReplyComposer {...defaultProps} />);
    expect(screen.getByRole('button', { name: /@Librarian/i })).toBeTruthy();
  });

  it('appends @mention to the textarea value when a chip is clicked', () => {
    const onChange = vi.fn();
    render(<ReplyComposer {...defaultProps} value="Hello " onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /@Librarian/i }));
    expect(onChange).toHaveBeenCalledWith('Hello @Librarian ');
  });

  it('shows the keyboard shortcut hint', () => {
    const { container } = render(<ReplyComposer {...defaultProps} />);
    expect(container.textContent).toMatch(/⌘⏎|Cmd\+Enter|Ctrl\+Enter/i);
  });

  it('disables the textarea when disabled is true', () => {
    render(<ReplyComposer {...defaultProps} disabled />);
    expect(screen.getByPlaceholderText(/reply to this thread/i)).toHaveProperty('disabled', true);
  });

  it('calls onKeyDown on keyboard events', () => {
    const onKeyDown = vi.fn();
    render(<ReplyComposer {...defaultProps} onKeyDown={onKeyDown} />);
    const textarea = screen.getByPlaceholderText(/reply to this thread/i);
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    expect(onKeyDown).toHaveBeenCalled();
  });

  it('renders no chips when minds array is empty', () => {
    render(<ReplyComposer {...defaultProps} minds={[]} />);
    expect(screen.queryByRole('button', { name: /@Librarian/i })).toBeNull();
  });
});
