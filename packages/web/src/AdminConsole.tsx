// ABOUTME: Dev-only admin test console for project bootstrapping and API debugging
// ABOUTME: Guarded by the /admin/test route and reused by the foundation router refactor

import { Button, Input, Textarea } from '@mastra-mindspace/ui';

import type { AccessibleProjectSummary } from './api';
import { InlineError } from './InlineError';
import { navigate } from './router';

export type AdminConsoleProps = {
  user: { email: string | null } | null;
  projects: AccessibleProjectSummary[];
  projectName: string;
  projectId: string;
  adminMessage: string;
  meResult: string;
  mindspaceResult: string;
  adminResult: string;
  errors: Map<string, string>;
  testEmail: string;
  testPassword: string;
  isLoadingOp: (op: string) => boolean;
  onSetProjectName: (name: string) => void;
  onSetProjectId: (id: string) => void;
  onSetAdminMessage: (message: string) => void;
  onSetTestEmail: (email: string) => void;
  onSetTestPassword: (password: string) => void;
  onSignInWithGoogle: () => void;
  onSignOut: () => void;
  onTestSignIn: () => void;
  onGetMe: () => void;
  onBootstrapProject: () => void;
  onRunAdminTest: () => void;
};

function formatJson(value: unknown, fallback: string) {
  return value ? JSON.stringify(value, null, 2) : fallback;
}

export function AdminConsole({
  user,
  projects,
  projectName,
  projectId,
  adminMessage,
  meResult,
  mindspaceResult,
  adminResult,
  errors,
  testEmail,
  testPassword,
  isLoadingOp,
  onSetProjectName,
  onSetProjectId,
  onSetAdminMessage,
  onSetTestEmail,
  onSetTestPassword,
  onSignInWithGoogle,
  onSignOut,
  onTestSignIn,
  onGetMe,
  onBootstrapProject,
  onRunAdminTest,
}: AdminConsoleProps) {
  return (
    <main className="admin-shell">
      <section className="panel admin-panel">
        <p className="eyebrow">Mastra Mindspace</p>
        <h1>Admin Test Console</h1>
        <p className="lede">
          Authenticate with Firebase, provision a workspace, and jump into the Slack-shaped chat surface.
        </p>

        <div className="control-row">
          <Button onClick={onSignInWithGoogle} disabled={Boolean(user)}>
            Sign in with Google
          </Button>
          <Button onClick={onSignOut} disabled={!user}>
            Sign out
          </Button>
          <Button onClick={onGetMe} disabled={!user || isLoadingOp('me')}>
            GET /api/me
          </Button>
        </div>

        {import.meta.env.DEV ? (
          <fieldset className="field">
            <legend>Test credentials (dev only)</legend>
            <label className="field">
              <span>Email</span>
              <Input
                type="email"
                value={testEmail}
                onChange={(event) => onSetTestEmail(event.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span>Password</span>
              <Input
                type="password"
                value={testPassword}
                onChange={(event) => onSetTestPassword(event.target.value)}
                autoComplete="off"
              />
            </label>
            <div className="control-row">
              <Button
                onClick={onTestSignIn}
                disabled={Boolean(user) || !testEmail || !testPassword || isLoadingOp('test-sign-in')}
              >
                Sign in with test credentials
              </Button>
            </div>
          </fieldset>
        ) : null}

        <label className="field">
          <span>Authenticated user</span>
          <Input value={user?.email ?? 'Not signed in'} readOnly />
        </label>

        <label className="field">
          <span>New project name</span>
          <Input value={projectName} onChange={(event) => onSetProjectName(event.target.value)} />
        </label>

        <div className="control-row">
          <Button onClick={onBootstrapProject} disabled={!user || isLoadingOp('bootstrap')}>
            Create Demo Project
          </Button>
          <Button
            onClick={() => {
              if (projectId) {
                navigate(`/chat/${projectId}`);
              }
            }}
            disabled={!projectId}
          >
            Open Chat Mindspace
          </Button>
        </div>

        <label className="field">
          <span>Project ID</span>
          <Input value={projectId} onChange={(event) => onSetProjectId(event.target.value)} />
        </label>

        <label className="field">
          <span>Message</span>
          <Textarea
            aria-label="Message"
            value={adminMessage}
            onChange={(event) => onSetAdminMessage(event.target.value)}
            rows={4}
          />
        </label>

        <div className="control-row">
          <Button onClick={onRunAdminTest} disabled={!user || !projectId || isLoadingOp('admin-test')}>
            Run Admin Test
          </Button>
        </div>
      </section>

      <section className="panel panel-output">
        <InlineError message={errors.get('admin')} />
        <article>
          <h2>Projects</h2>
          <p className="sidebar-empty">
            Admin project listing is separate from project membership. Opening chat still depends on project access.
          </p>
          <div className="mindspace-list admin-project-list" aria-label="Projects">
            {projects.length === 0 ? (
              <p className="sidebar-empty">No projects exist in this local dev database yet.</p>
            ) : (
              projects.map((project) => (
                <button
                  key={project.id}
                  className={project.id === projectId ? 'mindspace-button mindspace-button-active' : 'mindspace-button'}
                  onClick={() => onSetProjectId(project.id)}
                >
                  <span className="mindspace-button-name">{project.name}</span>
                  <span className="mindspace-button-slug">{project.slug}</span>
                </button>
              ))
            )}
          </div>
        </article>
        <article>
          <h2>Profile</h2>
          <pre>{meResult || 'No profile request yet.'}</pre>
        </article>
        <article>
          <h2>Bootstrap response</h2>
          <pre>{mindspaceResult || 'No bootstrap request yet.'}</pre>
        </article>
        <article>
          <h2>Admin Test</h2>
          <pre>{adminResult || 'No admin test response yet.'}</pre>
        </article>
        <article>
          <h2>Last Error</h2>
          <pre>{formatJson(errors.get('admin'), 'No errors.')}</pre>
        </article>
      </section>
    </main>
  );
}
