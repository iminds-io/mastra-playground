import { useEffect, useMemo, useState } from 'react';

import {
  bootstrapProject,
  createChannelPost,
  createProjectChannel,
  getChannelThread,
  getMe,
  getWorkspace,
  listAccessibleProjects,
  listChannelFeed,
  listProjectChannels,
  runAdminTest,
  streamThreadReply,
  type AccessibleProjectSummary,
  type ChannelFeedPost,
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

function mergeProjects(
  current: AccessibleProjectSummary[],
  incoming: AccessibleProjectSummary[],
): AccessibleProjectSummary[] {
  const map = new Map<string, AccessibleProjectSummary>();

  for (const project of current) {
    map.set(project.id, project);
  }

  for (const project of incoming) {
    map.set(project.id, project);
  }

  return [...map.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function formatJson(value: unknown, fallback: string) {
  return value ? JSON.stringify(value, null, 2) : fallback;
}

function formatReplyCount(replyCount: number) {
  return `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`;
}

function createOptimisticMessage(role: 'user' | 'assistant', text: string): ThreadMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role,
    text,
    createdAt: new Date().toISOString(),
  };
}

export function App() {
  const [route, setRoute] = useState<RouteState>(() => readRoute(window.location.pathname));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [projectName, setProjectName] = useState('Demo Project');
  const [projectId, setProjectId] = useState('');
  const [adminMessage, setAdminMessage] = useState('hello');
  const [meResult, setMeResult] = useState('');
  const [workspaceResult, setWorkspaceResult] = useState('');
  const [adminResult, setAdminResult] = useState('');
  const [lastError, setLastError] = useState('');
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const [projects, setProjects] = useState<AccessibleProjectSummary[]>([]);
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [newChannelName, setNewChannelName] = useState('engineering');
  const [feedPosts, setFeedPosts] = useState<ChannelFeedPost[]>([]);
  const [newPostMessage, setNewPostMessage] = useState('');
  const [selectedThread, setSelectedThread] = useState<ThreadSummary | null>(null);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [replyMessage, setReplyMessage] = useState('');
  const [streamingReply, setStreamingReply] = useState('');

  const currentProjectId = route.name === 'chat' ? route.projectId : projectId;
  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId) ?? null,
    [channels, selectedChannelId],
  );
  const currentProject = useMemo(
    () => projects.find((project) => project.id === currentProjectId) ?? null,
    [projects, currentProjectId],
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
      setProjects([]);
      setChannels([]);
      setFeedPosts([]);
      setSelectedThread(null);
      setThreadMessages([]);
      return;
    }

    void handleGetMe();
    void handleLoadProjects();
  }, [user]);

  useEffect(() => {
    if (route.name !== 'chat') {
      return;
    }

    setProjectId(route.projectId);
    setSelectedThread(null);
    setThreadMessages([]);
    setStreamingReply('');
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

    setSelectedThread(null);
    setThreadMessages([]);
    setStreamingReply('');
    void handleLoadFeed(route.projectId, selectedChannelId);
  }, [user, route, selectedChannelId]);

  async function handleGetMe() {
    if (!user) {
      return;
    }

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

  async function handleLoadProjects() {
    if (!user) {
      return;
    }

    setIsLoading('projects');
    setLastError('');
    try {
      const result = await listAccessibleProjects(user);
      setProjects((current) => mergeProjects(current, result.projects));
    } catch (error) {
      setLastError(String(error));
    } finally {
      setIsLoading(null);
    }
  }

  async function handleBootstrapProject() {
    if (!user) {
      return;
    }

    setIsLoading('bootstrap');
    setLastError('');
    try {
      const result = await bootstrapProject(user, projectName);
      const bootstrappedProject = result.project;
      setProjectId(result.projectId);
      setWorkspaceResult(JSON.stringify(result, null, 2));
      if (bootstrappedProject) {
        setProjects((current) => mergeProjects(current, [bootstrappedProject]));
      }
    } catch (error) {
      setLastError(String(error));
    } finally {
      setIsLoading(null);
    }
  }

  async function handleGetWorkspace() {
    if (!user || !projectId) {
      return;
    }

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
    if (!user || !projectId) {
      return;
    }

    setIsLoading('admin-test');
    setLastError('');
    try {
      const result = await runAdminTest(user, projectId, adminMessage);
      setAdminResult(JSON.stringify(result, null, 2));
    } catch (error) {
      setLastError(String(error));
    } finally {
      setIsLoading(null);
    }
  }

  async function handleLoadChannels(nextProjectId: string) {
    if (!user) {
      return;
    }

    setIsLoading('channels');
    setLastError('');
    try {
      const result = await listProjectChannels(user, nextProjectId);
      setChannels(result.channels);
      setSelectedChannelId((current) => {
        if (current && result.channels.some((channel) => channel.id === current)) {
          return current;
        }

        return result.channels[0]?.id ?? '';
      });
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
      setChannels((current) =>
        [...current, result.channel].sort((left, right) => left.name.localeCompare(right.name)),
      );
      setSelectedChannelId(result.channel.id);
      setFeedPosts([]);
      setSelectedThread(null);
      setThreadMessages([]);
      setStreamingReply('');
      setNewChannelName('');
    } catch (error) {
      setLastError(String(error));
    } finally {
      setIsLoading(null);
    }
  }

  async function handleLoadFeed(nextProjectId: string, channelId: string) {
    if (!user) {
      return;
    }

    setIsLoading('feed');
    setLastError('');
    try {
      const result = await listChannelFeed(user, nextProjectId, channelId);
      setFeedPosts(result.posts);
    } catch (error) {
      setLastError(String(error));
    } finally {
      setIsLoading(null);
    }
  }

  async function handleOpenThread(threadId: string) {
    if (!user || route.name !== 'chat' || !route.projectId || !selectedChannelId) {
      return;
    }

    setIsLoading('thread');
    setLastError('');
    try {
      const result = await getChannelThread(user, route.projectId, selectedChannelId, threadId);
      setSelectedThread(result.thread);
      setThreadMessages(result.messages);
      setStreamingReply('');
    } catch (error) {
      setLastError(String(error));
    } finally {
      setIsLoading(null);
    }
  }

  async function handleCreatePost() {
    if (!user || route.name !== 'chat' || !route.projectId || !selectedChannelId) {
      return;
    }

    const message = newPostMessage.trim();

    if (!message) {
      return;
    }

    setIsLoading('create-post');
    setLastError('');
    try {
      const result = await createChannelPost(user, route.projectId, selectedChannelId, message);
      setFeedPosts((current) => [
        {
          threadId: result.thread.id,
          rootMessageId: result.rootMessage.id,
          rootMessageText: result.rootMessage.text,
          rootMessageRole: result.rootMessage.role,
          replyCount: 0,
          lastMessageAt: result.thread.lastMessageAt,
          createdAt: result.rootMessage.createdAt,
        },
        ...current.filter((post) => post.threadId !== result.thread.id),
      ]);
      setNewPostMessage('');
      await handleOpenThread(result.thread.id);
    } catch (error) {
      setLastError(String(error));
    } finally {
      setIsLoading(null);
    }
  }

  async function handleReplyInThread() {
    if (!user || route.name !== 'chat' || !route.projectId || !selectedChannelId || !selectedThread) {
      return;
    }

    const message = replyMessage.trim();

    if (!message) {
      return;
    }

    setIsLoading('reply');
    setLastError('');
    setThreadMessages((current) => [...current, createOptimisticMessage('user', message)]);
    setReplyMessage('');
    setStreamingReply('');

    try {
      await streamThreadReply(
        user,
        route.projectId,
        selectedChannelId,
        selectedThread.id,
        message,
        {
          onEvent: (event) => {
            if (event.event === 'token') {
              setStreamingReply((current) => `${current}${String(event.data.text ?? '')}`);
            }

            if (event.event === 'message_saved') {
              setThreadMessages((current) => [
                ...current,
                {
                  id: String(event.data.id ?? `assistant-${Date.now()}`),
                  role: String(event.data.role ?? 'assistant'),
                  text: String(event.data.text ?? ''),
                  createdAt: String(event.data.createdAt ?? new Date().toISOString()),
                },
              ]);
            }

            if (event.event === 'thread_updated') {
              const nextLastMessageAt =
                typeof event.data.lastMessageAt === 'string' ? event.data.lastMessageAt : null;

              if (nextLastMessageAt) {
                setFeedPosts((current) =>
                  current.map((post) =>
                    post.threadId === selectedThread.id
                      ? {
                          ...post,
                          lastMessageAt: nextLastMessageAt,
                          replyCount: post.replyCount + 1,
                        }
                      : post,
                  ),
                );
                setSelectedThread((current) =>
                  current
                    ? {
                        ...current,
                        lastMessageAt: nextLastMessageAt,
                        updatedAt: nextLastMessageAt,
                      }
                    : current,
                );
              }
            }
          },
        },
      );
    } catch (error) {
      setLastError(String(error));
    } finally {
      setIsLoading(null);
    }
  }

  if (route.name === 'chat') {
    return (
      <main className="workspace-shell">
        <aside className="workspace-rail">
          <div className="workspace-brand">
            <p className="eyebrow">Hono Workspace</p>
            <h1>Workspaces</h1>
          </div>

          <nav className="workspace-list" aria-label="Projects">
            {projects.map((project) => (
              <button
                key={project.id}
                className={project.id === route.projectId ? 'workspace-button workspace-button-active' : 'workspace-button'}
                onClick={() => navigate(`/chat/${project.id}`)}
              >
                <span className="workspace-button-name">{project.name}</span>
                <span className="workspace-button-slug">{project.slug}</span>
              </button>
            ))}
          </nav>

          <div className="workspace-rail-actions">
            <button onClick={() => navigate('/admin/test')}>Admin Test Console</button>
            <button onClick={() => void signOutUser()} disabled={!user}>
              Sign out
            </button>
          </div>
        </aside>

        <aside className="channels-sidebar">
          <header className="sidebar-header">
            <p className="eyebrow">Project</p>
            <h2>{currentProject?.name ?? route.projectId}</h2>
          </header>

          <label className="field">
            <span>Create channel</span>
            <input
              value={newChannelName}
              onChange={(event) => setNewChannelName(event.target.value)}
              placeholder="engineering"
            />
          </label>

          <button
            onClick={() => void handleCreateChannel()}
            disabled={!user || !route.projectId || isLoading === 'create-channel'}
          >
            Add channel
          </button>

          <nav className="channel-list" aria-label="Channels">
            {channels.map((channel) => (
              <button
                key={channel.id}
                className={channel.id === selectedChannelId ? 'channel-button channel-button-active' : 'channel-button'}
                onClick={() => setSelectedChannelId(channel.id)}
              >
                <span className="channel-hash">#</span>
                <span>{channel.name}</span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="channel-feed">
          <header className="channel-feed-header">
            <div>
              <p className="eyebrow">Channel</p>
              <h2>#{selectedChannel?.name ?? 'Select a channel'}</h2>
            </div>
            <p className="channel-status">
              {isLoading === 'feed' ? 'Refreshing feed...' : 'Thread roots appear here.'}
            </p>
          </header>

          <div className="feed-list">
            {feedPosts.length === 0 ? (
              <p className="empty-state">No channel posts yet.</p>
            ) : (
              feedPosts.map((post) => (
                <article key={post.threadId} className="feed-card">
                  <button
                    className="feed-card-button"
                    onClick={() => void handleOpenThread(post.threadId)}
                    aria-label={`Open thread for ${post.rootMessageText}`}
                  >
                    <p className="feed-card-text">{post.rootMessageText}</p>
                    <div className="feed-card-meta">
                      <span>{formatReplyCount(post.replyCount)}</span>
                      <span>{post.lastMessageAt ? new Date(post.lastMessageAt).toLocaleString() : 'Just now'}</span>
                    </div>
                  </button>
                </article>
              ))
            )}
          </div>

          <div className="composer-panel">
            <label className="field">
              <span>Start a post</span>
              <textarea
                aria-label="Start a post"
                value={newPostMessage}
                onChange={(event) => setNewPostMessage(event.target.value)}
                rows={4}
                placeholder={`Share an update in #${selectedChannel?.name ?? 'channel'}`}
              />
            </label>

            <button
              onClick={() => void handleCreatePost()}
              disabled={!user || !selectedChannelId || isLoading === 'create-post'}
            >
              {`Send to ${selectedChannel?.name ?? 'channel'}`}
            </button>
          </div>
        </section>

        <aside className="thread-drawer">
          <header className="thread-header">
            <p className="eyebrow">Thread</p>
            <h2>{selectedThread ? 'Conversation' : 'Select a post'}</h2>
            <p className="thread-subtitle">
              {selectedThread
                ? 'Replies stream here while the channel feed stays stable.'
                : 'Choose a feed post to open its thread.'}
            </p>
          </header>

          <div className="thread-messages">
            {threadMessages.length === 0 ? (
              <p className="empty-state">No thread selected.</p>
            ) : (
              threadMessages.map((entry) => (
                <article key={entry.id} className={`thread-message thread-message-${entry.role}`}>
                  <p className="thread-message-role">{entry.role}</p>
                  <p>{entry.text}</p>
                </article>
              ))
            )}
            {streamingReply ? (
              <article className="thread-message thread-message-assistant thread-message-streaming">
                <p className="thread-message-role">assistant</p>
                <p>{streamingReply}</p>
              </article>
            ) : null}
          </div>

          <label className="field">
            <span>Reply in thread</span>
            <textarea
              aria-label="Reply in thread"
              value={replyMessage}
              onChange={(event) => setReplyMessage(event.target.value)}
              rows={4}
              disabled={!selectedThread}
            />
          </label>

          <button
            onClick={() => void handleReplyInThread()}
            disabled={!selectedThread || isLoading === 'reply'}
          >
            Reply in thread
          </button>

          <div className="thread-debug">
            <h3>Status</h3>
            <p>{lastError || 'Connected'}</p>
          </div>
        </aside>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <section className="panel admin-panel">
        <p className="eyebrow">Hono Workspace</p>
        <h1>Admin Test Console</h1>
        <p className="lede">
          Authenticate with Firebase, provision a workspace, and jump into the Slack-shaped chat surface.
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
          <button
            onClick={() => {
              if (projectId) {
                navigate(`/chat/${projectId}`);
              }
            }}
            disabled={!projectId}
          >
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
            value={adminMessage}
            onChange={(event) => setAdminMessage(event.target.value)}
            rows={4}
          />
        </label>

        <div className="control-row">
          <button
            onClick={() => void handleRunAdminTest()}
            disabled={!user || !projectId || isLoading === 'admin-test'}
          >
            Run Admin Test
          </button>
        </div>
      </section>

      <section className="panel panel-output">
        <article>
          <h2>Projects</h2>
          <div className="workspace-list admin-project-list" aria-label="Projects">
            {projects.map((project) => (
              <button
                key={project.id}
                className={project.id === projectId ? 'workspace-button workspace-button-active' : 'workspace-button'}
                onClick={() => setProjectId(project.id)}
              >
                <span className="workspace-button-name">{project.name}</span>
                <span className="workspace-button-slug">{project.slug}</span>
              </button>
            ))}
          </div>
        </article>
        <article>
          <h2>Profile</h2>
          <pre>{meResult || 'No profile request yet.'}</pre>
        </article>
        <article>
          <h2>Workspace</h2>
          <pre>{workspaceResult || 'No workspace request yet.'}</pre>
        </article>
        <article>
          <h2>Admin Test</h2>
          <pre>{adminResult || 'No admin test response yet.'}</pre>
        </article>
        <article>
          <h2>Last Error</h2>
          <pre>{formatJson(lastError, 'No errors.')}</pre>
        </article>
      </section>
    </main>
  );
}
