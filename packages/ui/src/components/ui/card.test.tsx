// ABOUTME: Tests for Card and its composable sub-components
// ABOUTME: Verifies rendering, class application, and content projection

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';

afterEach(() => {
  cleanup();
});

describe('Card', () => {
  it('renders its children', () => {
    render(<Card>Card body</Card>);
    expect(screen.getByText('Card body')).toBeTruthy();
  });

  it('applies border and bg-card classes', () => {
    render(<Card data-testid="card">Body</Card>);
    const el = screen.getByTestId('card');
    expect(el.className).toContain('border');
    expect(el.className).toContain('bg-card');
  });

  it('merges custom className', () => {
    render(<Card data-testid="card" className="my-card">Body</Card>);
    expect(screen.getByTestId('card').className).toContain('my-card');
  });
});

describe('CardHeader', () => {
  it('renders children', () => {
    render(<CardHeader>Header content</CardHeader>);
    expect(screen.getByText('Header content')).toBeTruthy();
  });
});

describe('CardTitle', () => {
  it('renders as a heading element', () => {
    render(<CardTitle>My Title</CardTitle>);
    expect(screen.getByText('My Title')).toBeTruthy();
  });

  it('applies heading font class', () => {
    render(<CardTitle data-testid="title">Title</CardTitle>);
    expect(screen.getByTestId('title').className).toContain('font-heading');
  });
});

describe('CardDescription', () => {
  it('renders with muted foreground class', () => {
    render(<CardDescription data-testid="desc">Desc</CardDescription>);
    expect(screen.getByTestId('desc').className).toContain('text-muted-foreground');
  });
});

describe('CardContent', () => {
  it('renders children', () => {
    render(<CardContent>Content</CardContent>);
    expect(screen.getByText('Content')).toBeTruthy();
  });
});

describe('CardFooter', () => {
  it('renders children', () => {
    render(<CardFooter>Footer</CardFooter>);
    expect(screen.getByText('Footer')).toBeTruthy();
  });
});
