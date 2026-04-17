// ABOUTME: Tests for Badge variant rendering and class application
// ABOUTME: Verifies default variant and all named variants apply correct classes

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Badge } from './badge';

afterEach(() => {
  cleanup();
});

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>2 replies</Badge>);
    expect(screen.getByText('2 replies')).toBeTruthy();
  });

  it('renders as a span', () => {
    render(<Badge data-testid="badge">Label</Badge>);
    expect(screen.getByTestId('badge').tagName).toBe('SPAN');
  });

  it('applies muted variant by default', () => {
    render(<Badge data-testid="badge">Label</Badge>);
    expect(screen.getByTestId('badge').className).toContain('bg-muted');
  });

  it('applies primary variant', () => {
    render(<Badge data-testid="badge" variant="default">Label</Badge>);
    expect(screen.getByTestId('badge').className).toContain('bg-primary');
  });

  it('applies secondary variant', () => {
    render(<Badge data-testid="badge" variant="secondary">Label</Badge>);
    expect(screen.getByTestId('badge').className).toContain('bg-secondary');
  });

  it('applies outline variant', () => {
    render(<Badge data-testid="badge" variant="outline">Label</Badge>);
    expect(screen.getByTestId('badge').className).toContain('border');
  });

  it('merges custom className', () => {
    render(<Badge data-testid="badge" className="extra">Label</Badge>);
    expect(screen.getByTestId('badge').className).toContain('extra');
  });
});
