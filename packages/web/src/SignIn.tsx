// ABOUTME: Google-only sign-in screen for the root route
// ABOUTME: Shows centered branding, a single auth action, and inline auth errors

import { Button } from '@mastra-mindspace/ui';

import { InlineError } from './InlineError';

export type SignInProps = {
  onSignInWithGoogle: () => void;
  isSigningIn: boolean;
  error?: string | undefined;
};

export function SignIn({ onSignInWithGoogle, isSigningIn, error }: SignInProps) {
  return (
    <main className="sign-in-screen">
      <div className="sign-in-card">
        <h1 className="sign-in-brand">Mastra Mindspace</h1>
        <p className="sign-in-tagline">AI-powered team workspaces</p>
        <Button onClick={onSignInWithGoogle} disabled={isSigningIn} className="sign-in-button">
          Sign in with Google
        </Button>
        <InlineError message={error} />
      </div>
    </main>
  );
}
