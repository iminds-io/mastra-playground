// @vitest-environment jsdom
// ABOUTME: Tests for post-authentication smart routing logic
// ABOUTME: Validates 0/1/2+ project routing behavior

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigateSpy = vi.fn();

vi.mock('./router', async () => {
  const actual = await vi.importActual<typeof import('./router')>('./router');

  return {
    ...actual,
    navigate: (...args: unknown[]) => navigateSpy(...args),
  };
});

import { PostAuthRouter } from './PostAuthRouter';
import { Router } from './router';

describe('PostAuthRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('navigates to /chat/:projectId when user has exactly 1 project', async () => {
    const projects = [{ id: 'proj-1', organizationId: 'org-1', name: 'Solo', slug: 'solo', status: 'active' }] as const;

    render(
      <Router>
        <PostAuthRouter projects={[...projects]} isLoading={false} onSignOut={vi.fn()} />
      </Router>,
    );

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith('/chat/proj-1');
    });
  });

  it('shows a dead-end message when user has 0 projects', () => {
    render(
      <Router>
        <PostAuthRouter projects={[]} isLoading={false} onSignOut={vi.fn()} />
      </Router>,
    );

    expect(screen.getByText(/don't have access/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeTruthy();
  });

  it('navigates to the first project when user has 2+ projects', async () => {
    const projects = [
      { id: 'proj-1', organizationId: 'org-1', name: 'Alpha', slug: 'alpha', status: 'active' },
      { id: 'proj-2', organizationId: 'org-1', name: 'Beta', slug: 'beta', status: 'active' },
    ];

    render(
      <Router>
        <PostAuthRouter projects={projects} isLoading={false} onSignOut={vi.fn()} />
      </Router>,
    );

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith('/chat/proj-1');
    });
  });

  it('shows a loading state while projects are being fetched', () => {
    render(
      <Router>
        <PostAuthRouter projects={[]} isLoading onSignOut={vi.fn()} />
      </Router>,
    );

    expect(screen.getByText(/loading/i)).toBeTruthy();
    expect(screen.queryByText(/don't have access/i)).toBeNull();
  });
});
