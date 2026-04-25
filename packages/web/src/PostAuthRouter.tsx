// ABOUTME: Post-authentication root-route router based on accessible project count
// ABOUTME: Routes to the first project or shows a dead-end screen when no access exists

import { useEffect } from 'react';

import { Button, Spinner } from '@mastra-mindspace/ui';

import type { AccessibleProjectSummary } from './api';
import { navigate } from './router';

export type PostAuthRouterProps = {
  projects: AccessibleProjectSummary[];
  isLoading: boolean;
  onSignOut: () => void;
};

export function PostAuthRouter({ projects, isLoading, onSignOut }: PostAuthRouterProps) {
  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (projects.length >= 1) {
      navigate(`/chat/${projects[0]!.id}`);
    }
  }, [projects, isLoading]);

  if (isLoading) {
    return (
      <main className="sign-in-screen">
        <div className="sign-in-card">
          <Spinner size="lg" />
          <p>Loading your workspaces...</p>
        </div>
      </main>
    );
  }

  if (projects.length === 0) {
    return (
      <main className="sign-in-screen">
        <div className="sign-in-card">
          <h1 className="sign-in-brand">Mastra Mindspace</h1>
          <p>You don&apos;t have access to any projects yet. Contact your admin for access.</p>
          <Button onClick={onSignOut}>Sign out</Button>
        </div>
      </main>
    );
  }

  return null;
}
