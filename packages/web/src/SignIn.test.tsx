// @vitest-environment jsdom
// ABOUTME: Tests for the sign-in screen component
// ABOUTME: Validates brand text, Google button, and sign-in callback

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SignIn } from './SignIn';

describe('SignIn', () => {
  afterEach(cleanup);

  it('renders the brand name and tagline', () => {
    render(<SignIn onSignInWithGoogle={vi.fn()} isSigningIn={false} />);

    expect(screen.getByText(/mastra mindspace/i)).toBeTruthy();
    expect(screen.getByText(/ai-powered team workspaces/i)).toBeTruthy();
  });

  it('renders a single "Sign in with Google" button', () => {
    render(<SignIn onSignInWithGoogle={vi.fn()} isSigningIn={false} />);

    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeTruthy();
  });

  it('calls onSignInWithGoogle when the button is clicked', () => {
    const handleSignIn = vi.fn();

    render(<SignIn onSignInWithGoogle={handleSignIn} isSigningIn={false} />);

    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

    expect(handleSignIn).toHaveBeenCalledOnce();
  });

  it('disables the button while signing in', () => {
    render(<SignIn onSignInWithGoogle={vi.fn()} isSigningIn />);

    expect(screen.getByRole('button', { name: /sign in with google/i })).toHaveProperty('disabled', true);
  });

  it('shows an error message when provided', () => {
    render(<SignIn onSignInWithGoogle={vi.fn()} isSigningIn={false} error="Auth failed" />);

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/auth failed/i)).toBeTruthy();
  });
});
