// ABOUTME: Post-authentication root-route router based on accessible project count
// ABOUTME: Routes to the first project or shows a dead-end screen when no access exists

import { useEffect } from 'react';

import { Button, Spinner } from '@mastra-mindspace/ui';

import type { AccessibleProjectSummary } from './api';
import { navigate } from './router';

export type PostAuthRouterProps = {
  projects: AccessibleProjectSummary[];
  isLoading: boolean;
  targetProjectId: string | null;
  canAccessAdminConsole: boolean;
  bootstrapError: string | null;
  onRetryBootstrap: () => void;
  onSignOut: () => void;
};

export function PostAuthRouter({
  projects,
  isLoading,
  targetProjectId,
  canAccessAdminConsole,
  bootstrapError,
  onRetryBootstrap,
  onSignOut,
}: PostAuthRouterProps) {
  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (targetProjectId) {
      navigate(`/chat/${targetProjectId}`);
      return;
    }

    if (projects.length === 0 && canAccessAdminConsole && !bootstrapError) {
      navigate('/admin/test');
    }
  }, [bootstrapError, canAccessAdminConsole, isLoading, projects.length, targetProjectId]);

  if (isLoading) {
    return (
      <main className="sign-in-screen">
        <div className="sign-in-card">
          <Spinner size="lg" />
          <p>Opening your mindspace...</p>
        </div>
      </main>
    );
  }

  if (bootstrapError) {
    return (
      <main className="sign-in-screen">
        <div className="sign-in-card">
          <h1 className="sign-in-brand">Mastra Mindspace</h1>
          <p>We couldn&apos;t load your mindspace entry.</p>
          <p>{bootstrapError}</p>
          <div className="row gap-3 justify-center">
            <Button onClick={onRetryBootstrap}>Retry</Button>
            <Button variant="outline" onClick={onSignOut}>
              Sign out
            </Button>
          </div>
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
