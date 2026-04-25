// @vitest-environment jsdom
// ABOUTME: Tests for the minimal component-based router
// ABOUTME: Validates path matching, param extraction, navigation, and route rendering

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Route, Router, navigate, useRoute } from './router';

function TestRouteDisplay() {
  const route = useRoute();

  return (
    <div>
      <span data-testid="path">{route.path}</span>
      <span data-testid="params">{JSON.stringify(route.params)}</span>
    </div>
  );
}

describe('Router', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the matching route', () => {
    window.history.pushState({}, '', '/chat/project-1');

    render(
      <Router>
        <Route path="/">
          <div>home</div>
        </Route>
        <Route path="/chat/:projectId">
          <div>chat view</div>
        </Route>
      </Router>,
    );

    expect(screen.getByText('chat view')).toBeTruthy();
    expect(screen.queryByText('home')).toBeNull();
  });

  it('extracts params from the URL', () => {
    window.history.pushState({}, '', '/chat/project-abc');

    render(
      <Router>
        <Route path="/chat/:projectId">
          <TestRouteDisplay />
        </Route>
      </Router>,
    );

    expect(screen.getByTestId('params').textContent).toBe('{"projectId":"project-abc"}');
  });

  it('matches the root path', () => {
    window.history.pushState({}, '', '/');

    render(
      <Router>
        <Route path="/">
          <div>root</div>
        </Route>
        <Route path="/chat/:projectId">
          <div>chat</div>
        </Route>
      </Router>,
    );

    expect(screen.getByText('root')).toBeTruthy();
  });

  it('updates on navigate()', () => {
    window.history.pushState({}, '', '/');

    render(
      <Router>
        <Route path="/">
          <div>home</div>
        </Route>
        <Route path="/chat/:projectId">
          <div>chat</div>
        </Route>
      </Router>,
    );

    expect(screen.getByText('home')).toBeTruthy();

    act(() => navigate('/chat/project-2'));

    expect(screen.queryByText('home')).toBeNull();
    expect(screen.getByText('chat')).toBeTruthy();
  });

  it('renders nothing when no route matches', () => {
    window.history.pushState({}, '', '/unknown/path');

    const { container } = render(
      <Router>
        <Route path="/">
          <div>home</div>
        </Route>
        <Route path="/chat/:projectId">
          <div>chat</div>
        </Route>
      </Router>,
    );

    expect(container.textContent).toBe('');
  });

  it('provides path and params via useRoute inside a matched route', () => {
    window.history.pushState({}, '', '/chat/my-project');

    render(
      <Router>
        <Route path="/chat/:projectId">
          <TestRouteDisplay />
        </Route>
      </Router>,
    );

    expect(screen.getByTestId('path').textContent).toBe('/chat/my-project');
  });

  it('matches /admin/test as a static path', () => {
    window.history.pushState({}, '', '/admin/test');

    render(
      <Router>
        <Route path="/">
          <div>home</div>
        </Route>
        <Route path="/admin/test">
          <div>admin</div>
        </Route>
      </Router>,
    );

    expect(screen.getByText('admin')).toBeTruthy();
  });
});
