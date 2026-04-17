// ABOUTME: Tests for the Textarea component prop passthrough and class application
// ABOUTME: Verifies renders as textarea, handles value/onChange/disabled

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Textarea } from './textarea';

afterEach(() => {
  cleanup();
});

describe('Textarea', () => {
  it('renders as a textarea element', () => {
    render(<Textarea aria-label="message" />);
    expect(screen.getByRole('textbox', { name: /message/i })).toBeTruthy();
  });

  it('displays a value', () => {
    render(<Textarea aria-label="field" value="hello" onChange={() => {}} />);
    expect((screen.getByRole('textbox', { name: /field/i }) as HTMLTextAreaElement).value).toBe('hello');
  });

  it('fires onChange when typed into', async () => {
    const handler = vi.fn();
    render(<Textarea aria-label="field" onChange={handler} />);
    await userEvent.type(screen.getByRole('textbox', { name: /field/i }), 'abc');
    expect(handler).toHaveBeenCalled();
  });

  it('is disabled when disabled prop is set', () => {
    render(<Textarea aria-label="field" disabled />);
    expect((screen.getByRole('textbox', { name: /field/i }) as HTMLTextAreaElement).disabled).toBe(true);
  });

  it('applies border and bg-input classes', () => {
    render(<Textarea aria-label="field" />);
    const el = screen.getByRole('textbox', { name: /field/i });
    expect(el.className).toContain('border');
    expect(el.className).toContain('bg-input');
  });

  it('merges custom className', () => {
    render(<Textarea aria-label="field" className="my-textarea" />);
    expect(screen.getByRole('textbox', { name: /field/i }).className).toContain('my-textarea');
  });

  it('forwards ref', () => {
    let ref: HTMLTextAreaElement | null = null;
    render(<Textarea aria-label="field" ref={(el) => { ref = el; }} />);
    expect(ref).toBeInstanceOf(HTMLTextAreaElement);
  });
});
