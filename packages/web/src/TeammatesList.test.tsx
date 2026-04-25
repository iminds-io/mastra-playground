// @vitest-environment jsdom
// ABOUTME: Tests for the TeammatesList sidebar section
// ABOUTME: Verifies teammate rendering with initials avatars and presence indicators

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { TeammateSummary } from './sidebar-stubs';
import { TeammatesList } from './TeammatesList';

const TEAMMATES: TeammateSummary[] = [
  { id: 't-1', displayName: 'Alice Chen', initials: 'AC', email: 'alice@example.com', presence: 'online' },
  { id: 't-2', displayName: 'Bob Martinez', initials: 'BM', email: 'bob@example.com', presence: 'offline' },
];

describe('TeammatesList', () => {
  afterEach(cleanup);

  it('renders each teammate name', () => {
    render(<TeammatesList teammates={TEAMMATES} />);

    expect(screen.getByText('Alice Chen')).toBeTruthy();
    expect(screen.getByText('Bob Martinez')).toBeTruthy();
  });

  it('shows the TEAMMATES section header', () => {
    render(<TeammatesList teammates={TEAMMATES} />);

    expect(screen.getByText('TEAMMATES')).toBeTruthy();
  });

  it('renders initials avatars', () => {
    render(<TeammatesList teammates={TEAMMATES} />);

    expect(screen.getByText('AC')).toBeTruthy();
    expect(screen.getByText('BM')).toBeTruthy();
  });

  it('shows presence indicators', () => {
    const { container } = render(<TeammatesList teammates={TEAMMATES} />);

    expect(container.querySelectorAll('.presence-online').length).toBe(1);
    expect(container.querySelectorAll('.presence-offline').length).toBe(1);
  });

  it('renders empty state when no teammates exist', () => {
    render(<TeammatesList teammates={[]} />);

    expect(screen.getByText(/no teammates/i)).toBeTruthy();
  });
});
