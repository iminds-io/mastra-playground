// @vitest-environment jsdom
// ABOUTME: Tests for the Avatar component covering initials and icon modes
// ABOUTME: Verifies rendering, sizing, and accent ring presence

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Avatar } from './Avatar';

describe('Avatar', () => {
  afterEach(cleanup);

  it('renders initials text for the initials variant', () => {
    render(<Avatar variant="initials" text="AC" />);

    expect(screen.getByText('AC')).toBeTruthy();
  });

  it('renders emoji for the icon variant', () => {
    render(<Avatar variant="icon" text="🤖" />);

    expect(screen.getByText('🤖')).toBeTruthy();
  });

  it('applies accent ring class for the icon variant', () => {
    render(<Avatar variant="icon" text="📚" />);

    const avatar = screen.getByText('📚').closest('.avatar');
    expect(avatar?.classList.contains('avatar-accent-ring')).toBe(true);
  });

  it('does not apply accent ring for the initials variant', () => {
    render(<Avatar variant="initials" text="BM" />);

    const avatar = screen.getByText('BM').closest('.avatar');
    expect(avatar?.classList.contains('avatar-accent-ring')).toBe(false);
  });

  it('supports a size prop', () => {
    render(<Avatar variant="initials" text="AC" size="sm" />);

    const avatar = screen.getByText('AC').closest('.avatar');
    expect(avatar?.classList.contains('avatar-sm')).toBe(true);
  });

  it('renders initials from name for the human type', () => {
    render(<Avatar type="human" name="Alice Chen" />);

    expect(screen.getByLabelText('Alice Chen')).toBeTruthy();
    expect(screen.getByText('AC')).toBeTruthy();
  });

  it('renders a mind emoji with the accent ring for the mind type', () => {
    render(<Avatar type="mind" name="Claude" emoji="🤖" />);

    const avatar = screen.getByLabelText('Claude');
    expect(avatar.className).toContain('avatar-ring-accent');
    expect(screen.getByText('🤖')).toBeTruthy();
  });

  it('renders a primary ring for the current-user type', () => {
    render(<Avatar type="current-user" name="Alice Chen" />);

    const avatar = screen.getByLabelText('Alice Chen');
    expect(avatar.className).toContain('avatar-ring-primary');
  });
});
