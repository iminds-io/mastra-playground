// ABOUTME: Tests for the Button component variants, sizes, and behaviour
// ABOUTME: Covers default rendering, variant classes, disabled state, and asChild

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './button';

afterEach(() => {
  cleanup();
});

describe('Button', () => {
  it('renders a button element with its children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeTruthy();
  });

  it('fires onClick when clicked', async () => {
    const handler = vi.fn();
    render(<Button onClick={handler}>Go</Button>);
    await userEvent.click(screen.getByRole('button', { name: /go/i }));
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not fire onClick when disabled', async () => {
    const handler = vi.fn();
    render(<Button disabled onClick={handler}>Disabled</Button>);
    await userEvent.click(screen.getByRole('button', { name: /disabled/i }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('applies the default variant class', () => {
    render(<Button>Default</Button>);
    const btn = screen.getByRole('button', { name: /default/i });
    expect(btn.className).toContain('bg-foreground');
  });

  it('applies the primary variant class', () => {
    render(<Button variant="primary">Primary</Button>);
    expect(screen.getByRole('button', { name: /primary/i }).className).toContain('bg-primary');
  });

  it('applies the ghost variant — no background', () => {
    render(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole('button', { name: /ghost/i }).className).toContain('bg-transparent');
  });

  it('applies the outline variant', () => {
    render(<Button variant="outline">Outline</Button>);
    expect(screen.getByRole('button', { name: /outline/i }).className).toContain('border');
  });

  it('merges custom className', () => {
    render(<Button className="my-custom">Custom</Button>);
    expect(screen.getByRole('button', { name: /custom/i }).className).toContain('my-custom');
  });

  it('renders the child element when asChild is true', () => {
    render(
      <Button asChild>
        <a href="/test">Link button</a>
      </Button>,
    );
    expect(screen.getByRole('link', { name: /link button/i })).toBeTruthy();
  });

  it('forwards ref to the button element', () => {
    let ref: HTMLButtonElement | null = null;
    render(<Button ref={(el) => { ref = el; }}>Ref</Button>);
    expect(ref).toBeInstanceOf(HTMLButtonElement);
  });
});
