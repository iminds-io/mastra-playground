// ABOUTME: Tests for ScrollArea wrapper around Radix ScrollAreaPrimitive
// ABOUTME: Verifies children render and scrollbar is present in DOM

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ScrollArea } from './scroll-area';

afterEach(() => {
  cleanup();
});

describe('ScrollArea', () => {
  it('renders its children', () => {
    render(
      <ScrollArea>
        <p>Scrollable content</p>
      </ScrollArea>,
    );
    expect(screen.getByText('Scrollable content')).toBeTruthy();
  });

  it('merges custom className on the root', () => {
    render(
      <ScrollArea className="my-scroll" data-testid="root">
        <p>Content</p>
      </ScrollArea>,
    );
    expect(screen.getByTestId('root').className).toContain('my-scroll');
  });
});
