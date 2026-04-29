// @vitest-environment jsdom
// ABOUTME: Tests for the MindsList sidebar section
// ABOUTME: Verifies mind rendering with avatars, names, and presence indicators

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { MindSummary } from './sidebar-stubs';
import { MindsList } from './MindsList';

const MINDS: MindSummary[] = [
  { id: 'mind-1', name: 'Librarian', icon: '\u{1F4DA}', presence: 'online' },
];

describe('MindsList', () => {
  afterEach(cleanup);

  it('renders each mind name', () => {
    render(<MindsList minds={MINDS} />);

    expect(screen.getByText('Librarian')).toBeTruthy();
  });

  it('shows the MINDS section header', () => {
    render(<MindsList minds={MINDS} />);

    expect(screen.getByText('MINDS')).toBeTruthy();
  });

  it('renders emoji avatars', () => {
    render(<MindsList minds={MINDS} />);

    expect(screen.getByText('\u{1F4DA}')).toBeTruthy();
  });

  it('shows presence indicators', () => {
    const { container } = render(<MindsList minds={MINDS} />);

    expect(container.querySelectorAll('.presence-online').length).toBe(1);
    expect(container.querySelectorAll('.presence-offline').length).toBe(0);
  });

  it('renders empty state when no minds are configured', () => {
    render(<MindsList minds={[]} />);

    expect(screen.getByText(/no minds configured/i)).toBeTruthy();
  });

  it('renders the new mind placeholder affordance', () => {
    render(<MindsList minds={MINDS} />);

    expect(screen.getByText(/new mind creation coming soon/i)).toBeTruthy();
  });
});
