// @vitest-environment jsdom
// ABOUTME: Tests for the UserFooter sidebar component
// ABOUTME: Covers user identity display, sign out, and theme toggle cycling

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UserFooter } from './UserFooter';

describe('UserFooter', () => {
  afterEach(cleanup);

  it('renders the user display name', () => {
    render(
      <UserFooter
        displayName="Alice Chen"
        initials="AC"
        theme="system"
        onSignOut={vi.fn()}
        onToggleTheme={vi.fn()}
      />,
    );

    expect(screen.getByText('Alice Chen')).toBeTruthy();
  });

  it('renders the user initials avatar', () => {
    render(
      <UserFooter
        displayName="Alice Chen"
        initials="AC"
        theme="system"
        onSignOut={vi.fn()}
        onToggleTheme={vi.fn()}
      />,
    );

    expect(screen.getByText('AC')).toBeTruthy();
  });

  it('calls onSignOut when sign out is clicked', () => {
    const onSignOut = vi.fn();

    render(
      <UserFooter
        displayName="Alice Chen"
        initials="AC"
        theme="system"
        onSignOut={onSignOut}
        onToggleTheme={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText(/sign out/i));
    expect(onSignOut).toHaveBeenCalled();
  });

  it('calls onToggleTheme when theme toggle is clicked', () => {
    const onToggle = vi.fn();

    render(
      <UserFooter
        displayName="Alice Chen"
        initials="AC"
        theme="light"
        onSignOut={vi.fn()}
        onToggleTheme={onToggle}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /toggle theme/i }));
    expect(onToggle).toHaveBeenCalled();
  });

  it('shows sun icon for light theme', () => {
    render(
      <UserFooter
        displayName="Alice Chen"
        initials="AC"
        theme="light"
        onSignOut={vi.fn()}
        onToggleTheme={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /toggle theme/i }).textContent).toContain('\u2600\uFE0F');
  });

  it('shows moon icon for dark theme', () => {
    render(
      <UserFooter
        displayName="Alice Chen"
        initials="AC"
        theme="dark"
        onSignOut={vi.fn()}
        onToggleTheme={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /toggle theme/i }).textContent).toContain('\u{1F319}');
  });

  it('shows computer icon for system theme', () => {
    render(
      <UserFooter
        displayName="Alice Chen"
        initials="AC"
        theme="system"
        onSignOut={vi.fn()}
        onToggleTheme={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /toggle theme/i }).textContent).toContain('\u{1F4BB}');
  });
});
