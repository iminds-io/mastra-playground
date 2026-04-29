// @vitest-environment jsdom
// ABOUTME: Integration tests for the composed Sidebar component
// ABOUTME: Verifies all sections render and interact correctly together

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AccessibleProjectSummary, ChannelSummary } from './api';
import type { MindSummary, TeammateSummary } from './sidebar-stubs';
import { Sidebar } from './Sidebar';

const PROJECTS: AccessibleProjectSummary[] = [
  { id: 'p1', organizationId: 'org-1', name: 'Acme Engineering', slug: 'acme-eng', status: 'active' },
  { id: 'p2', organizationId: 'org-1', name: 'Q2 Roadmap', slug: 'q2-roadmap', status: 'active' },
];

const CHANNELS: ChannelSummary[] = [
  { id: 'ch-1', name: 'general', slug: 'general' },
  { id: 'ch-2', name: 'engineering', slug: 'engineering' },
];

const MINDS: MindSummary[] = [{ id: 'mind-1', name: 'Librarian', icon: '\u{1F4DA}', presence: 'online' }];
const TEAMMATES: TeammateSummary[] = [
  { id: 't-1', displayName: 'Alice Chen', initials: 'AC', email: 'alice@example.com', presence: 'online' },
];

function renderSidebar(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const defaults: Parameters<typeof Sidebar>[0] = {
    projects: PROJECTS,
    activeProjectId: 'p1',
    isAdmin: false,
    channels: CHANNELS,
    selectedChannelId: 'ch-1',
    isCreatingChannel: false,
    channelError: undefined,
    minds: MINDS,
    teammates: TEAMMATES,
    userName: 'Alice Chen',
    userInitials: 'AC',
    theme: 'system',
    onNavigateProject: vi.fn(),
    onOpenSettings: vi.fn(),
    onSelectChannel: vi.fn(),
    onCreateChannel: vi.fn(),
    onSignOut: vi.fn(),
    onToggleTheme: vi.fn(),
  };

  return render(<Sidebar {...defaults} {...overrides} />);
}

describe('Sidebar', () => {
  afterEach(cleanup);

  it('renders the project switcher with the active project name', () => {
    renderSidebar();

    expect(screen.getByText('Acme Engineering')).toBeTruthy();
  });

  it('renders the channels section', () => {
    renderSidebar();

    expect(screen.getByText('CHANNELS')).toBeTruthy();
    expect(screen.getByText('general')).toBeTruthy();
    expect(screen.getByText('engineering')).toBeTruthy();
  });

  it('renders the minds section', () => {
    renderSidebar();

    expect(screen.getByText('MINDS')).toBeTruthy();
    expect(screen.getByText('Librarian')).toBeTruthy();
  });

  it('renders the teammates section', () => {
    renderSidebar();

    expect(screen.getByText('TEAMMATES')).toBeTruthy();
    expect(screen.getAllByText('Alice Chen').length).toBeGreaterThan(0);
  });

  it('renders the user footer with sign out', () => {
    renderSidebar();

    expect(screen.getByText(/sign out/i)).toBeTruthy();
  });

  it('selects a channel when clicked', () => {
    const onSelect = vi.fn();

    renderSidebar({ onSelectChannel: onSelect });

    fireEvent.click(screen.getByText('engineering'));

    expect(onSelect).toHaveBeenCalledWith('ch-2');
  });

  it('signs out when sign out is clicked', () => {
    const onSignOut = vi.fn();

    renderSidebar({ onSignOut });

    fireEvent.click(screen.getByText(/sign out/i));

    expect(onSignOut).toHaveBeenCalled();
  });
});
