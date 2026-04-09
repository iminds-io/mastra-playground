import { useEffect, useMemo, useState } from 'react';

import {
  bootstrapProject,
  createChannelThread,
  createProjectChannel,
  getChannelThread,
  getMe,
  getWorkspace,
  listChannelThreads,
  listProjectChannels,
  runAdminTest,
  sendChannelMessage,
  type ChannelSummary,
  type ThreadMessage,
  type ThreadSummary,
} from './api';
import { auth, onAuthStateChanged, signInWithGoogle, signOutUser } from './firebase';
import './styles.css';

type AuthUser = {
  uid: string;
  email: string | null;
  getIdToken(): Promise<string>;
};

type RouteState =
  | {
      name: 'chat';
      projectId: string;
    }
  | {
      name: 'admin';
    };

function readRoute(pathname: string): RouteState {
  const match = pathname.match(/^\/chat\/([^/]+)$/);

  if (match?.[1]) {
    return {
      name: 'chat',
      projectId: decodeURIComponent(match[1]),
    };
  }

  return { name: 'admin' };
}

function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function formatJson(value: unknown, fallback: string) {
  return value ? JSON.stringify(value, null, 2) : fallback;
}

export function App() {
  const [route, setRoute] = useState<RouteState>(() => readRoute(window.location.pathname));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [projectId, setProjectId] = useState('');
  const [projectName, setProjectName] = useState('Demo Project');
  const [message, setMessage] = useState('hello');
  const [meResult, setMeResult] = useState<string>('');
  const [workspaceResult, setWorkspaceResult] = useState<string>('');
  const [adminResult, setAdminResult] = useState<string>('');
  const [lastError, setLastError] = useState('');
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [newChannelName, setNewChannelName] = useState('engineering');
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState('');
  const [threadTitle, setThreadTitle] = useState('New thread');
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [chatMessage, setChatMessage] = useState('hello channel');
  const [chatMeta, setChatMeta] = useState<string>('');

  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId) ?? null,
    [channels, selectedChannelId],
  );
  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [threads, selectedThreadId],
  );

  useEffect(() => {
    const handlePopState = () => {
      setRoute(readRoute(window.location.pathname));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser as AuthUser | null);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setMeResult('');
      setChannels([]);
      setThreads([]);
      setMessages([]);
      return;
    }

    void handleGetMe();
  }, [user]);

  useEffect(() => {
    if (route.name !== 'chat') {
      return;
    }

    setProjectId(route.projectId);
  }, [route]);

  useEffect(() => {
    if (!user || route.name !== 'chat' || !route.projectId) {
      return;
    }

    void handleLoadChannels(route.projectId);
  }, [user, route]);

  useEffect(() => {
    if (!user || route.name !== 'chat' || !route.projectId || !selectedChannelId) {
      return;
    }

    void handleLoadThreads(route.projectId, selectedChannelId);
  }, [user, route, selectedChannelId]);

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

  async function handleRunAdminTest() {
    if (!user || !projectId) return;
    setIsLoading('admin-test');
    setLastError('');
    try {
      const result = await runAdminTest(user, projectId, message);
      setAdminResult(JSON.stringify(result, null, 2));
    } catch (error) {
      setLastError(String(error));
    } finally {
      setIsLoading(null);
    }
  }

  async function handleLoadChannels(currentProjectId: string) {
    if (!user) return;
    setIsLoading('channels');
    setLastError('');
    try {
      const result = await listProjectChannels(user, currentProjectId);
      setChannels(result.channels);
      setSelectedChannelId((current) =>
        current && result.channels.some((channel) => channel.id === current)
          ? current
          : (result.channels[0]?.id ?? ''),
      );
    } catch (error) {
      setLastError(String(error));
    } finally {
      setIsLoading(null);
    }
  }

  async function handleCreateChannel() {
    if (!user || route.name !== 'chat' || !route.projectId || !newChannelName.trim()) {
      return;
    }

    setIsLoading('create-channel');
    setLastError('');
    try {
      const result = await createProjectChannel(user, route.projectId, newChannelName.trim());
      setChannels((current) => [...current, result.channel].sort((left, right) => left.name.localeCompare(right.name)));
      setSelectedChannelId(result.channel.id);
      setThreads([]);
      setSelectedThreadId('');
      setMessages([]);
      setNewChannelName('');
    } catch (error) {
      setLastError(String(error));
    } finally {
      setIsLoading(null);
    }
  }

  async function handleLoadThreads(currentProjectId: string, channelId: string) {
    if (!user) return;
    setIsLoading('threads');
    setLastError('');
    try {
      const result = await listChannelThreads(user, currentProjectId, channelId);
      setThreads(result.threads);
      setSelectedThreadId((current) =>
        current && result.threads.some((thread) => thread.id === current)
          ? current
          : '',
      );
      setMessages((current) => (selectedThreadId ? current : []));
    } catch (error) {
      setLastError(String(error));
    } finally {
      setIsLoading(null);
    }
  }

  async function handleCreateThread() {
    if (!user || route.name !== 'chat' || !route.projectId || !selectedChannelId) {
      return;
    }

    setIsLoading('create-thread');
    setLastError('');
    try {
      const result = await createChannelThread(
        user,
        route.projectId,
        selectedChannelId,
        threadTitle.trim() || 'New thread',
      );
      setThreads((current) => [result.thread, ...current.filter((thread) => thread.id !== result.thread.id)]);
      setSelectedThreadId(result.thread.id);
      setMessages([]);
      setThreadTitle('New thread');
    } catch (error) {
      setLastError(String(error));
    } finally {
      setIsLoading(null);
    }
  }

  async function handleSelectThread(thread: ThreadSummary) {
    if (!user || route.name !== 'chat') {
      return;
    }

    setIsLoading('thread');
    setLastError('');
    try {
      const result = await getChannelThread(user, route.projectId, thread.channelId, thread.id);
      setSelectedThreadId(thread.id);
      setMessages(result.messages);
      setChatMeta(JSON.stringify(result.thread, null, 2));
    } catch (error) {
      setLastError(String(error));
    } finally {
      setIsLoading(null);
    }
  }

  async function handleSendMessage() {
    if (!user || route.name !== 'chat' || !route.projectId || !selectedChannelId || !selectedThreadId) {
      return;
    }

    const outboundMessage = chatMessage.trim();

    if (!outboundMessage) {
      return;
    }

    setIsLoading('chat-send');
    setLastError('');
    try {
      const userMessage: ThreadMessage = {
        id: `local-user-${Date.now()}`,
        role: 'user',
        text: outboundMessage,
        createdAt: new Date().toISOString(),
      };
      setMessages((current) => [...current, userMessage]);

      const result = await sendChannelMessage(
        user,
        route.projectId,
        selectedChannelId,
        selectedThreadId,
        outboundMessage,
      );
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${result.runId ?? Date.now()}`,
          role: 'assistant',
          text: result.text,
          createdAt: new Date().toISOString(),
        },
      ]);
      setChatMeta(JSON.stringify(result, null, 2));
      setChatMessage('');
    } catch (error) {
      setLastError(String(error));
    } finally {
      setIsLoading(null);
    }
  }

  if (route.name === 'chat') {
    return (
      <main className="chat-shell">
        <section className="panel chat-sidebar">
          <p className="eyebrow">Hono Workspace</p>
          <h1>Project Chat</h1>
          <p className="lede">
            Persisted project conversations grouped by channel, with multiple threads per channel.
          </p>

          <div className="control-row">
            <button onClick={() => navigate('/admin/test')}>Open Admin Test</button>
            <button onClick={() => void signOutUser()} disabled={!user}>
              Sign out
            </button>
          </div>

          <label className="field">
            <span>Project ID</span>
            <input value={route.projectId} readOnly />
          </label>

          <label className="field">
            <span>New channel</span>
            <input
              value={newChannelName}
              onChange={(event) => setNewChannelName(event.target.value)}
              placeholder="engineering"
            />
          </label>

          <div className="control-row">
            <button
              onClick={() => void handleCreateChannel()}
              disabled={!user || isLoading === 'create-channel'}
            >
              Create channel
            </button>
          </div>

          <div className="list-block">
            <h2>Channels</h2>
            <div className="list-column">
              {channels.map((channel) => (
                <button
                  key={channel.id}
                  className={channel.id === selectedChannelId ? 'list-button list-button-active' : 'list-button'}
                  onClick={() => setSelectedChannelId(channel.id)}
                >
                  {channel.name}
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span>New thread title</span>
            <input
              value={threadTitle}
              onChange={(event) => setThreadTitle(event.target.value)}
              placeholder="New thread"
            />
          </label>

          <div className="control-row">
            <button
              onClick={() => void handleCreateThread()}
              disabled={!user || !selectedChannelId || isLoading === 'create-thread'}
            >
              Create thread
            </button>
          </div>

          <div className="list-block">
            <h2>Threads</h2>
            <div className="list-column">
              {threads.map((thread) => (
                <button
                  key={thread.id}
                  className={thread.id === selectedThreadId ? 'list-button list-button-active' : 'list-button'}
                  onClick={() => void handleSelectThread(thread)}
                >
                  {thread.title || 'Untitled thread'}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="panel chat-main">
          <article className="message-panel">
            <h2>{selectedThread?.title || 'Select a thread'}</h2>
            <p className="lede">
              {selectedChannel ? `Channel: ${selectedChannel.name}` : 'Choose a channel to start.'}
            </p>
            <div className="message-list">
              {messages.map((entry) => (
                <div key={entry.id} className={`message-bubble message-${entry.role}`}>
                  <p className="message-role">{entry.role}</p>
                  <p>{entry.text}</p>
                </div>
              ))}
              {messages.length === 0 ? <p className="empty-state">No messages yet.</p> : null}
            </div>

            <label className="field">
              <span>Chat Message</span>
              <textarea
                aria-label="Chat Message"
                value={chatMessage}
                onChange={(event) => setChatMessage(event.target.value)}
                rows={4}
              />
            </label>

            <div className="control-row">
              <button
                onClick={() => void handleSendMessage()}
                disabled={!user || !selectedThreadId || isLoading === 'chat-send'}
              >
                Send message
              </button>
            </div>
          </article>

          <article>
            <h2>Thread Metadata</h2>
            <pre>{chatMeta || 'No thread metadata yet.'}</pre>
          </article>
          <article>
            <h2>Profile</h2>
            <pre>{meResult || 'No profile request yet.'}</pre>
          </article>
          <article>
            <h2>Last Error</h2>
            <pre>{lastError || 'No errors.'}</pre>
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="panel">
        <p className="eyebrow">Hono Workspace</p>
        <h1>Admin Test Console</h1>
        <p className="lede">
          Authenticate with Firebase, create a project, inspect the workspace route, and run the
          protected admin test endpoint.
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
          <button onClick={() => navigate(projectId ? `/chat/${projectId}` : '/chat/project-id')} disabled={!projectId}>
            Open Chat Workspace
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
            onClick={() => void handleRunAdminTest()}
            disabled={!user || !projectId || isLoading === 'admin-test'}
          >
            Run admin test
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
          <h2>Admin Test</h2>
          <pre>{adminResult || 'No admin test run yet.'}</pre>
        </article>
        <article>
          <h2>Last Error</h2>
          <pre>{lastError || 'No errors.'}</pre>
        </article>
      </section>
    </main>
  );
}
