// @vitest-environment jsdom
// ABOUTME: Tests for the project switcher dropdown overlay
// ABOUTME: Covers display, filtering, grouping, selection, and access control

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AccessibleProjectSummary } from './api';
import { ProjectSwitcher } from './ProjectSwitcher';

const PROJECTS: AccessibleProjectSummary[] = [
  { id: 'p1', organizationId: 'org-1', name: 'Acme Engineering', slug: 'acme-eng', status: 'active' },
  { id: 'p2', organizationId: 'org-1', name: 'Q2 Roadmap', slug: 'q2-roadmap', status: 'active' },
  { id: 'p3', organizationId: 'org-1', name: 'Auth Rewrite', slug: 'auth-rewrite', status: 'archived' },
];

describe('ProjectSwitcher', () => {
  afterEach(cleanup);

  it('shows the active project name and slug', () => {
    render(
      <ProjectSwitcher
        projects={PROJECTS}
        activeProjectId="p1"
        isAdmin={false}
        onSelectProject={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.getByText('Acme Engineering')).toBeTruthy();
    expect(screen.getByText(/acme-eng/)).toBeTruthy();
  });

  it('opens the project list overlay when the trigger is clicked', () => {
    render(
      <ProjectSwitcher
        projects={PROJECTS}
        activeProjectId="p1"
        isAdmin={false}
        onSelectProject={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.queryByPlaceholderText(/search projects/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));
    expect(screen.getByPlaceholderText(/search projects/i)).toBeTruthy();
  });

  it('filters projects by search text', () => {
    render(
      <ProjectSwitcher
        projects={PROJECTS}
        activeProjectId="p1"
        isAdmin={false}
        onSelectProject={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));
    fireEvent.change(screen.getByPlaceholderText(/search projects/i), {
      target: { value: 'road' },
    });

    const overlay = screen.getByPlaceholderText(/search projects/i).closest('.project-switcher-overlay');
    expect(within(overlay as HTMLElement).queryByText('Acme Engineering')).toBeNull();
    expect(screen.getByText('Q2 Roadmap')).toBeTruthy();
  });

  it('groups projects into active and archived sections', () => {
    render(
      <ProjectSwitcher
        projects={PROJECTS}
        activeProjectId="p1"
        isAdmin={false}
        onSelectProject={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));
    expect(screen.getByText('ACTIVE')).toBeTruthy();
    expect(screen.getByText('ARCHIVED')).toBeTruthy();
    expect(screen.getByText('Auth Rewrite')).toBeTruthy();
  });

  it('calls onSelectProject and closes overlay when a project is clicked', () => {
    const onSelect = vi.fn();

    render(
      <ProjectSwitcher
        projects={PROJECTS}
        activeProjectId="p1"
        isAdmin={false}
        onSelectProject={onSelect}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));
    fireEvent.click(screen.getByText('Q2 Roadmap'));

    expect(onSelect).toHaveBeenCalledWith('p2');
    expect(screen.queryByPlaceholderText(/search projects/i)).toBeNull();
  });

  it('shows a checkmark next to the active project', () => {
    render(
      <ProjectSwitcher
        projects={PROJECTS}
        activeProjectId="p1"
        isAdmin={false}
        onSelectProject={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));

    const activeItem = screen.getAllByText('Acme Engineering')[1]?.closest('[data-project-id]');
    expect(activeItem?.querySelector('.project-switcher-check')).toBeTruthy();
  });

  it('shows gear icon that calls onOpenSettings', () => {
    const onSettings = vi.fn();

    render(
      <ProjectSwitcher
        projects={PROJECTS}
        activeProjectId="p1"
        isAdmin={false}
        onSelectProject={vi.fn()}
        onOpenSettings={onSettings}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /project settings/i }));
    expect(onSettings).toHaveBeenCalled();
  });

  it('hides + Create project for non-admin users', () => {
    render(
      <ProjectSwitcher
        projects={PROJECTS}
        activeProjectId="p1"
        isAdmin={false}
        onSelectProject={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));
    expect(screen.queryByText(/create project/i)).toBeNull();
  });

  it('shows + Create project for admin users', () => {
    render(
      <ProjectSwitcher
        projects={PROJECTS}
        activeProjectId="p1"
        isAdmin
        onSelectProject={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));
    expect(screen.getByText(/create project/i)).toBeTruthy();
  });

  it('closes overlay when clicking outside', () => {
    render(
      <div>
        <ProjectSwitcher
          projects={PROJECTS}
          activeProjectId="p1"
          isAdmin={false}
          onSelectProject={vi.fn()}
          onOpenSettings={vi.fn()}
        />
        <div data-testid="outside">outside</div>
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));
    expect(screen.getByPlaceholderText(/search projects/i)).toBeTruthy();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByPlaceholderText(/search projects/i)).toBeNull();
  });
});
