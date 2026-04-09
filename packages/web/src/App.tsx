import { useEffect, useState } from 'react';

import { bootstrapProject, getMe, getWorkspace, runAgent } from './api';
import { auth, onAuthStateChanged, signInWithGoogle, signOutUser } from './firebase';
import './styles.css';

type AuthUser = {
  uid: string;
  email: string | null;
  getIdToken(): Promise<string>;
};

export function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [projectId, setProjectId] = useState('');
  const [projectName, setProjectName] = useState('Demo Project');
  const [message, setMessage] = useState('hello');
  const [meResult, setMeResult] = useState<string>('');
  const [workspaceResult, setWorkspaceResult] = useState<string>('');
  const [agentResult, setAgentResult] = useState<string>('');
  const [lastError, setLastError] = useState('');
  const [isLoading, setIsLoading] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser as AuthUser | null);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setMeResult('');
      return;
    }

    void handleGetMe();
  }, [user]);

  async function handleGetMe() {
    if (!user) return;
    setIsLoading('me');
    setLastError('');
    try {
      const result = await getMe(user);
      setMeResult(JSON.stringify(result, null, 2));
    } catch (error) {
      setLastError(String(error));
    } finally {
      setIsLoading(null);
    }
  }

  async function handleBootstrapProject() {
    if (!user) return;
    setIsLoading('bootstrap');
    setLastError('');
    try {
      const result = await bootstrapProject(user, projectName);
      setProjectId(result.projectId);
      setWorkspaceResult(JSON.stringify(result, null, 2));
    } catch (error) {
      setLastError(String(error));
    } finally {
      setIsLoading(null);
    }
  }

  async function handleGetWorkspace() {
    if (!user || !projectId) return;
    setIsLoading('workspace');
    setLastError('');
    try {
      const result = await getWorkspace(user, projectId);
      setWorkspaceResult(JSON.stringify(result, null, 2));
    } catch (error) {
      setLastError(String(error));
    } finally {
      setIsLoading(null);
    }
  }

  async function handleRunAgent() {
    if (!user || !projectId) return;
    setIsLoading('agent');
    setLastError('');
    try {
      const result = await runAgent(user, projectId, message);
      setAgentResult(JSON.stringify(result, null, 2));
    } catch (error) {
      setLastError(String(error));
    } finally {
      setIsLoading(null);
    }
  }

  return (
    <main className="app-shell">
      <section className="panel">
        <p className="eyebrow">Hono Workspace</p>
        <h1>Manual Test Console</h1>
        <p className="lede">
          Authenticate with Firebase, create a project, inspect the workspace route, and run the
          project-scoped agent endpoint.
        </p>

        <div className="control-row">
          <button onClick={() => void signInWithGoogle()} disabled={Boolean(user)}>
            Sign in with Google
          </button>
          <button onClick={() => void signOutUser()} disabled={!user}>
            Sign out
          </button>
          <button onClick={() => void handleGetMe()} disabled={!user || isLoading === 'me'}>
            GET /api/me
          </button>
        </div>

        <label className="field">
          <span>Authenticated user</span>
          <input value={user?.email ?? 'Not signed in'} readOnly />
        </label>

        <label className="field">
          <span>New project name</span>
          <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
        </label>

        <div className="control-row">
          <button
            onClick={() => void handleBootstrapProject()}
            disabled={!user || isLoading === 'bootstrap'}
          >
            Create Demo Project
          </button>
        </div>

        <label className="field">
          <span>Project ID</span>
          <input value={projectId} onChange={(event) => setProjectId(event.target.value)} />
        </label>

        <div className="control-row">
          <button
            onClick={() => void handleGetWorkspace()}
            disabled={!user || !projectId || isLoading === 'workspace'}
          >
            GET workspace
          </button>
        </div>

        <label className="field">
          <span>Message</span>
          <textarea
            aria-label="Message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={5}
          />
        </label>

        <div className="control-row">
          <button
            onClick={() => void handleRunAgent()}
            disabled={!user || !projectId || isLoading === 'agent'}
          >
            Run agent
          </button>
        </div>
      </section>

      <section className="panel panel-output">
        <article>
          <h2>Profile</h2>
          <pre>{meResult || 'No profile request yet.'}</pre>
        </article>
        <article>
          <h2>Workspace</h2>
          <pre>{workspaceResult || 'No workspace response yet.'}</pre>
        </article>
        <article>
          <h2>Agent</h2>
          <pre>{agentResult || 'No agent run yet.'}</pre>
        </article>
        <article>
          <h2>Last Error</h2>
          <pre>{lastError || 'No errors.'}</pre>
        </article>
      </section>
    </main>
  );
}
