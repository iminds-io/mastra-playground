import { useEffect, useMemo, useState } from 'react';

import { Badge, Button, Card, Input, cn, Textarea } from '@hono-workspace/ui';

import {
  bootstrapProject,
  createChannelPost,
  createProjectChannel,
  getChannelThread,
  getMe,
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
import { auth, onAuthStateChanged, signInWithEmailPassword, signInWithGoogle, signOutUser } from './firebase';
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

  // Dev-only test-credentials sign-in. Pre-fill from Vite env vars so the
  // buttons can authenticate against a deployed worker via the dev-server proxy
  // without a Google account. The whole panel is conditionally rendered on
  // `import.meta.env.DEV`, so production builds never contain it.
  const [testEmail, setTestEmail] = useState(
    (import.meta.env.VITE_FIREBASE_TEST_EMAIL as string | undefined) ?? '',
  );
  const [testPassword, setTestPassword] = useState(
    (import.meta.env.VITE_FIREBASE_TEST_PASSWORD as string | undefined) ?? '',
  );

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

  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId) ?? null,
    [channels, selectedChannelId],
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

  async function handleTestSignIn() {
    setIsLoading('test-sign-in');
    setLastError('');
    try {
      await signInWithEmailPassword(testEmail, testPassword);
    } catch (error) {
      setLastError(String(error));
    } finally {
      setIsLoading(null);
    }
  }

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
      await runThreadStream({
        threadId: result.thread.id,
        channelId: selectedChannelId,
      });
    } catch (error) {
      setLastError(String(error));
    } finally {
      setIsLoading(null);
    }
  }

  async function runThreadStream(input: {
    threadId: string;
    channelId: string;
    message?: string;
  }) {
    if (!user || route.name !== 'chat' || !route.projectId) {
      return;
    }

    try {
      await streamThreadReply(
        user,
        route.projectId,
        input.channelId,
        input.threadId,
        input.message,
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
              setStreamingReply('');
            }

            if (event.event === 'thread_updated') {
              const nextLastMessageAt =
                typeof event.data.lastMessageAt === 'string' ? event.data.lastMessageAt : null;

              if (nextLastMessageAt) {
                setFeedPosts((current) =>
                  current.map((post) =>
                    post.threadId === input.threadId
                      ? {
                          ...post,
                          lastMessageAt: nextLastMessageAt,
                          replyCount: post.replyCount + 1,
                        }
                      : post,
                  ),
                );
                setSelectedThread((current) =>
                  current && current.id === input.threadId
                    ? {
                        ...current,
                        lastMessageAt: nextLastMessageAt,
                        updatedAt: nextLastMessageAt,
                      }
                    : current,
                );
              }
            }

            if (event.event === 'done') {
              setStreamingReply('');
            }
          },
        },
      );
    } catch (error) {
      setLastError(String(error));
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
      await runThreadStream({
        threadId: selectedThread.id,
        channelId: selectedChannelId,
        message,
      });
    } finally {
      setIsLoading(null);
    }
  }

  if (route.name === 'chat') {
    return (
      <main className="workspace-shell">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <p className="eyebrow">Hono Workspace</p>
            <h1>Workspaces</h1>
          </div>

          <nav className="workspace-list" aria-label="Projects">
            {projects.map((project) => (
              <div key={project.id}>
                <button
                  className={project.id === route.projectId ? 'workspace-button workspace-button-active' : 'workspace-button'}
                  onClick={() => navigate(`/chat/${project.id}`)}
                >
                  <span className="workspace-button-name">{project.name}</span>
                  <span className="workspace-button-slug">{project.slug}</span>
                </button>

                {project.id === route.projectId && (
                  <div className="workspace-channels">
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

                    <div className="workspace-channels-actions">
                      <Input
                        value={newChannelName}
                        onChange={(event) => setNewChannelName(event.target.value)}
                        placeholder="new channel"
                        aria-label="New channel name"
                      />
                      <Button
                        onClick={() => void handleCreateChannel()}
                        disabled={!user || !route.projectId || isLoading === 'create-channel'}
                        size="sm"
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </nav>

          <div className="sidebar-actions">
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/test')}>Admin Console</Button>
            <Button variant="outline" size="sm" onClick={() => void signOutUser()} disabled={!user}>
              Sign out
            </Button>
          </div>
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
                <Card key={post.threadId} className="overflow-hidden">
                  <button
                    className="feed-card-button"
                    onClick={() => void handleOpenThread(post.threadId)}
                    aria-label={`Open thread for ${post.rootMessageText}`}
                  >
                    <p className="feed-card-text">{post.rootMessageText}</p>
                    <div className="feed-card-meta">
                      <Badge variant="muted">{formatReplyCount(post.replyCount)}</Badge>
                      <span>{post.lastMessageAt ? new Date(post.lastMessageAt).toLocaleString() : 'Just now'}</span>
                    </div>
                  </button>
                </Card>
              ))
            )}
          </div>

          <div className="composer-panel">
            <label className="field">
              <span>Start a post</span>
              <Textarea
                aria-label="Start a post"
                value={newPostMessage}
                onChange={(event) => setNewPostMessage(event.target.value)}
                rows={4}
                placeholder={`Share an update in #${selectedChannel?.name ?? 'channel'}`}
              />
            </label>

            <Button
              onClick={() => void handleCreatePost()}
              disabled={!user || !selectedChannelId || isLoading === 'create-post'}
            >
              {`Send to ${selectedChannel?.name ?? 'channel'}`}
            </Button>
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
                <Card
                  key={entry.id}
                  className={cn(
                    'p-4',
                    entry.role === 'user' ? 'bg-muted/40 border-border/50' : 'bg-primary/10 border-primary/20',
                  )}
                >
                  <p className="thread-message-role">{entry.role}</p>
                  <p style={{ margin: 0 }}>{entry.text}</p>
                </Card>
              ))
            )}
            {streamingReply ? (
              <Card className={cn('p-4 thread-message-streaming', 'bg-primary/10 border-primary/20')}>
                <p className="thread-message-role">assistant</p>
                <p style={{ margin: 0 }}>{streamingReply}</p>
              </Card>
            ) : null}
          </div>

          <label className="field">
            <span>Reply in thread</span>
            <Textarea
              aria-label="Reply in thread"
              value={replyMessage}
              onChange={(event) => setReplyMessage(event.target.value)}
              rows={4}
              disabled={!selectedThread}
            />
          </label>

          <Button
            onClick={() => void handleReplyInThread()}
            disabled={!selectedThread || isLoading === 'reply'}
          >
            Reply in thread
          </Button>

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
          <Button onClick={() => void signInWithGoogle()} disabled={Boolean(user)}>
            Sign in with Google
          </Button>
          <Button onClick={() => void signOutUser()} disabled={!user}>
            Sign out
          </Button>
          <Button onClick={() => void handleGetMe()} disabled={!user || isLoading === 'me'}>
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
                onChange={(event) => setTestEmail(event.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span>Password</span>
              <Input
                type="password"
                value={testPassword}
                onChange={(event) => setTestPassword(event.target.value)}
                autoComplete="off"
              />
            </label>
            <div className="control-row">
              <Button
                onClick={() => void handleTestSignIn()}
                disabled={Boolean(user) || !testEmail || !testPassword || isLoading === 'test-sign-in'}
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
          <Input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
        </label>

        <div className="control-row">
          <Button
            onClick={() => void handleBootstrapProject()}
            disabled={!user || isLoading === 'bootstrap'}
          >
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
            Open Chat Workspace
          </Button>
        </div>

        <label className="field">
          <span>Project ID</span>
          <Input value={projectId} onChange={(event) => setProjectId(event.target.value)} />
        </label>

        <label className="field">
          <span>Message</span>
          <Textarea
            aria-label="Message"
            value={adminMessage}
            onChange={(event) => setAdminMessage(event.target.value)}
            rows={4}
          />
        </label>

        <div className="control-row">
          <Button
            onClick={() => void handleRunAdminTest()}
            disabled={!user || !projectId || isLoading === 'admin-test'}
          >
            Run Admin Test
          </Button>
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
          <h2>Bootstrap response</h2>
          <pre>{workspaceResult || 'No bootstrap request yet.'}</pre>
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
