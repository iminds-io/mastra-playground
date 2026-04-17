// ABOUTME: Tests for the Input component prop passthrough and class application
// ABOUTME: Verifies renders as input, accepts standard HTML input attributes

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Input } from './input';

afterEach(() => {
  cleanup();
});

describe('Input', () => {
  it('renders as an input element', () => {
    render(<Input aria-label="email" />);
    expect(screen.getByRole('textbox', { name: /email/i })).toBeTruthy();
  });

  it('accepts and displays a value', () => {
    render(<Input aria-label="name" value="hello" onChange={() => {}} />);
    expect((screen.getByRole('textbox', { name: /name/i }) as HTMLInputElement).value).toBe('hello');
  });

  it('fires onChange when typed into', async () => {
    const handler = vi.fn();
    render(<Input aria-label="field" onChange={handler} />);
    await userEvent.type(screen.getByRole('textbox', { name: /field/i }), 'abc');
    expect(handler).toHaveBeenCalled();
  });

  it('is disabled when disabled prop is set', () => {
    render(<Input aria-label="field" disabled />);
    expect((screen.getByRole('textbox', { name: /field/i }) as HTMLInputElement).disabled).toBe(true);
  });

  it('applies border and bg-input classes', () => {
    render(<Input aria-label="field" />);
    const el = screen.getByRole('textbox', { name: /field/i });
    expect(el.className).toContain('border');
    expect(el.className).toContain('bg-input');
  });

  it('merges custom className', () => {
    render(<Input aria-label="field" className="my-input" />);
    expect(screen.getByRole('textbox', { name: /field/i }).className).toContain('my-input');
  });

  it('forwards ref', () => {
    let ref: HTMLInputElement | null = null;
    render(<Input aria-label="field" ref={(el) => { ref = el; }} />);
    expect(ref).toBeInstanceOf(HTMLInputElement);
  });
});
