// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const defaultAuthUser = {
  uid: 'firebase-user-1',
  email: 'user@example.com',
  getIdToken: vi.fn(async () => 'demo-token'),
};

class EventSourceMock {
  static instances: EventSourceMock[] = [];

  url: string;
  listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    EventSourceMock.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string, data: unknown) {
    const listeners = this.listeners.get(type) ?? [];
    for (const listener of listeners) {
      listener({ data: JSON.stringify(data) } as MessageEvent<string>);
    }
  }
}

const authState = {
  user: defaultAuthUser as typeof defaultAuthUser | null,
};

const api = vi.hoisted(() => ({
  getMe: vi.fn(async () => ({
    uid: 'firebase-user-1',
    email: 'user@example.com',
    emailVerified: true,
    name: 'Demo User',
  })),
  listAccessibleProjects: vi.fn(async () => ({
    projects: [
      {
        id: 'project-123',
        organizationId: 'org-1',
        name: 'Alpha Mindspace',
        slug: 'alpha-mindspace',
        status: 'active',
      },
      {
        id: 'project-456',
        organizationId: 'org-1',
        name: 'Beta Mindspace',
        slug: 'beta-mindspace',
        status: 'active',
      },
    ],
  })),
  bootstrapProject: vi.fn(async (_user: unknown, name: string) => ({
    projectId: 'project-789',
    organizationId: 'org-123',
    mindspaceRootPath: '/tmp/project-789',
    binding: {
      activeAgentRef: 'default',
      activeAgentVersion: 'v1',
    },
    defaultChannelId: 'channel-general',
    project: {
      id: 'project-789',
      organizationId: 'org-123',
      name,
      slug: 'demo-project',
      status: 'active',
    },
  })),
  runAdminTest: vi.fn(async (_user: unknown, projectId: string, message: string) => ({
    resourceId: `project:${projectId}`,
    mindspaceRootPath: `/tmp/${projectId}`,
    threadId: projectId,
    runId: 'run-123',
    modelId: 'openai/gpt-4.1-mini',
    text: `admin heard: ${message}`,
  })),
  listProjectChannels: vi.fn(async () => ({
    channels: [
      {
        id: 'channel-general',
        name: 'general',
        slug: 'general',
      },
      {
        id: 'channel-engineering',
        name: 'engineering',
        slug: 'engineering',
      },
    ],
  })),
  getProjectSettingsGeneral: vi.fn(async () => ({
    role: 'owner',
    project: {
      id: 'project-123',
      organizationId: 'org-1',
      name: 'Alpha Mindspace',
      slug: 'alpha-mindspace',
      status: 'active',
      createdAt: '2026-04-24T00:00:00.000Z',
    },
  })),
  listProjectSettingsMembers: vi.fn(async () => ({
    role: 'owner',
    members: [
      {
        membershipId: 'membership-1',
        userId: 'user-1',
        role: 'owner',
        displayName: 'Demo User',
        email: 'user@example.com',
      },
    ],
    invitations: [],
  })),
  listProjectMindConfigs: vi.fn(async () => ({
    role: 'owner',
    minds: [
      {
        id: 'mind-1',
        project_id: 'project-123',
        agent_id: 'librarian',
        display_name: 'Librarian',
        icon: '📚',
        blurb: 'Guide',
        enabled: true,
        prompt_override: null,
      },
    ],
  })),
  updateProjectSettingsGeneral: vi.fn(async (_user: unknown, _projectId: string, input: { name: string }) => ({
    project: {
      id: 'project-123',
      organizationId: 'org-1',
      name: input.name,
      slug: 'alpha-mindspace',
      status: 'active',
    },
  })),
  archiveProjectSettings: vi.fn(async () => ({
    project: {
      id: 'project-123',
      organizationId: 'org-1',
      name: 'Alpha Mindspace',
      slug: 'alpha-mindspace',
      status: 'archived',
    },
  })),
  inviteProjectMember: vi.fn(async () => ({
    invitation: {
      id: 'invite-1',
      project_id: 'project-123',
      email: 'new@example.com',
      role: 'member',
      invited_by_user_id: 'user-1',
      status: 'pending',
    },
  })),
  removeProjectMember: vi.fn(async () => ({
    membership: {
      id: 'membership-2',
      project_id: 'project-123',
      user_id: 'user-2',
      role: 'member',
    },
  })),
  updateProjectMindConfig: vi.fn(async (_user: unknown, _projectId: string, mindId: string, input: Record<string, unknown>) => ({
    mind: {
      id: mindId,
      project_id: 'project-123',
      agent_id: 'librarian',
      display_name: String(input.displayName ?? 'Librarian'),
      icon: String(input.icon ?? '📚'),
      blurb: (input.blurb as string | null | undefined) ?? 'Guide',
      enabled: Boolean(input.enabled ?? true),
      prompt_override: (input.promptOverride as string | null | undefined) ?? null,
    },
  })),
  createProjectChannel: vi.fn(async (_user: unknown, _projectId: string, name: string) => ({
    channel: {
      id: 'channel-product',
      name,
      slug: name.toLowerCase(),
    },
  })),
  listChannelFeed: vi.fn(async () => ({
    channel: {
      id: 'channel-general',
      name: 'general',
      slug: 'general',
    },
    posts: [
      {
        threadId: 'thread-1',
        rootMessageId: 'message-1',
        rootMessageText: 'Ship the mindspace shell this sprint.',
        rootMessageRole: 'user',
        replyCount: 2,
        lastMessageAt: '2026-04-09T01:00:00.000Z',
        createdAt: '2026-04-09T00:00:00.000Z',
      },
    ],
  })),
  createChannelPost: vi.fn(async (_user: unknown, _projectId: string, channelId: string, message: string) => ({
    thread: {
      id: 'thread-2',
      channelId,
      title: null,
      lastMessageAt: '2026-04-09T02:00:00.000Z',
      createdAt: '2026-04-09T02:00:00.000Z',
      updatedAt: '2026-04-09T02:00:00.000Z',
    },
    rootMessage: {
      id: 'message-2',
      role: 'user',
      text: message,
      createdAt: '2026-04-09T02:00:00.000Z',
    },
  })),
  searchMessages: vi.fn(async (_user: unknown, _projectId: string, query: string, options?: { channelId?: string }) => ({
    results: [
      {
        messageId: 'search-msg-1',
        threadId: options?.channelId === 'channel-engineering' ? 'thread-3' : 'thread-1',
        channelId: options?.channelId ?? 'channel-general',
        channelName: options?.channelId === 'channel-engineering' ? 'engineering' : 'general',
        messageText: `Matched: ${query}`,
        threadTitle: 'Search result thread',
        role: 'assistant',
        createdAt: '2026-04-09T00:03:00.000Z',
      },
    ],
  })),
  getChannelThread: vi.fn(async (_user: unknown, _projectId: string, channelId: string, threadId: string) => ({
    thread: {
      id: threadId,
      channelId,
      title: null,
      lastMessageAt: '2026-04-09T01:00:00.000Z',
      createdAt: '2026-04-09T00:00:00.000Z',
      updatedAt: '2026-04-09T01:00:00.000Z',
    },
    messages: [
      {
        id: 'message-1',
        role: 'user',
        text: 'Ship the mindspace shell this sprint.',
        createdAt: '2026-04-09T00:00:00.000Z',
      },
      {
        id: 'message-2',
        role: 'assistant',
        text: 'I can break that into milestones.',
        createdAt: '2026-04-09T00:01:00.000Z',
      },
    ],
  })),
  streamThreadReply: vi.fn(async (
    _user: unknown,
    _projectId: string,
    _channelId: string,
    threadId: string,
    message: string | undefined,
    handlers: {
      onEvent(event: { event: string; data: Record<string, unknown> }): void;
    },
    _agentId?: string,
  ) => {
    handlers.onEvent({
      event: 'ack',
      data: {
        threadId,
      },
    });
    handlers.onEvent({
      event: 'token',
      data: {
        text: 'Working ',
      },
    });
    handlers.onEvent({
      event: 'token',
      data: {
        text: 'through it.',
      },
    });
    handlers.onEvent({
      event: 'message_saved',
      data: {
        id: message ? 'assistant-reply' : 'assistant-root',
        role: 'assistant',
        text: message ? `Working through it. (${message})` : 'Working through it.',
        createdAt: '2026-04-09T00:02:00.000Z',
      },
    });
    handlers.onEvent({
      event: 'thread_updated',
      data: {
        threadId,
      },
    });
    handlers.onEvent({
      event: 'done',
      data: {
        threadId,
      },
    });
  }),
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

vi.mock('./firebase', () => ({
  auth: {},
  onAuthStateChanged: (_auth: unknown, callback: (user: typeof authState.user) => void) => {
    callback(authState.user);
    return () => {};
  },
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
}));

vi.mock('./api', () => api);

import { App } from './App';
import { signInWithGoogle } from './firebase';
import { Router } from './router';

function renderApp() {
  return render(
    <Router>
      <App />
    </Router>,
  );
}

describe('App', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/admin/test');
    vi.clearAllMocks();
    EventSourceMock.instances = [];
    authState.user = defaultAuthUser;
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('dark'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }));
    vi.stubGlobal('EventSource', EventSourceMock);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('bootstraps a project from admin and shows the new workspace in the project rail', async () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: /create demo project/i }));

    await waitFor(() => {
      expect(api.bootstrapProject).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: /open chat mindspace/i }));

    await waitFor(() => {
      expect(api.listAccessibleProjects).toHaveBeenCalledWith(authState.user);
    });

    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));

    expect(await screen.findByText('Alpha Mindspace')).toBeTruthy();
    expect(screen.getAllByText('Demo Project').length).toBeGreaterThan(0);
  });

  it('shows the sign-in screen at / when not authenticated', async () => {
    authState.user = null;
    window.history.pushState({}, '', '/');

    renderApp();

    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeTruthy();
    expect(screen.getByText(/mastra mindspace/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

    await waitFor(() => {
      expect(signInWithGoogle).toHaveBeenCalled();
    });
  });

  it('redirects to /chat/:projectId after auth when user has projects', async () => {
    window.history.pushState({}, '', '/');

    renderApp();

    await waitFor(() => {
      expect(window.location.pathname).toBe('/chat/project-123');
    });
  });

  it('renders the channel feed as root posts and opens a thread drawer for replies', async () => {
    window.history.pushState({}, '', '/chat/project-123');

    renderApp();

    await waitFor(() => {
      expect(api.listAccessibleProjects).toHaveBeenCalledWith(authState.user);
      expect(api.listProjectChannels).toHaveBeenCalledWith(authState.user, 'project-123');
      expect(api.listChannelFeed).toHaveBeenCalledWith(authState.user, 'project-123', 'channel-general');
    });

    expect(
      screen.getByRole('button', { name: /open thread for ship the mindspace shell this sprint\./i }),
    ).toBeTruthy();
    expect(screen.getByText(/2 replies/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /open thread for ship the mindspace shell this sprint\./i }));

    await waitFor(() => {
      expect(api.getChannelThread).toHaveBeenCalledWith(
        authState.user,
        'project-123',
        'channel-general',
        'thread-1',
      );
    });

    expect(screen.getByText('I can break that into milestones.')).toBeTruthy();
  });

  it('marks the active feed post when its thread is open', async () => {
    window.history.pushState({}, '', '/chat/project-123');

    renderApp();

    const postButton = await screen.findByRole('button', {
      name: /open thread for ship the mindspace shell this sprint\./i,
    });

    expect(postButton.className).not.toContain('feed-card-active');

    fireEvent.click(postButton);

    await waitFor(() => {
      expect(api.getChannelThread).toHaveBeenCalled();
    });

    expect(postButton.className).toContain('feed-card-active');
  });

  it('renders a theme toggle button in the sidebar', async () => {
    window.history.pushState({}, '', '/chat/project-123');

    renderApp();

    await waitFor(() => {
      expect(api.listProjectChannels).toHaveBeenCalled();
    });

    expect(screen.getByRole('button', { name: /toggle theme/i })).toBeTruthy();
  });

  it('opens the settings modal from the project gear button', async () => {
    window.history.pushState({}, '', '/chat/project-123');

    renderApp();

    await waitFor(() => {
      expect(api.listProjectChannels).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: /project settings/i }));

    expect(await screen.findByRole('dialog', { name: /project settings/i })).toBeTruthy();
    await waitFor(() => {
      expect(api.getProjectSettingsGeneral).toHaveBeenCalledWith(authState.user, 'project-123');
    });
  });

  it('creates a new channel post, auto-streams the root response, and clears transient stream text after save', async () => {
    window.history.pushState({}, '', '/chat/project-123');

    renderApp();

    await screen.findByRole('button', {
      name: /open thread for ship the mindspace shell this sprint\./i,
    });

    fireEvent.change(screen.getByLabelText(/start a post/i), {
      target: { value: 'Map the rollout by milestone.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send to general/i }));

    await waitFor(() => {
      expect(api.createChannelPost).toHaveBeenCalledWith(
        authState.user,
        'project-123',
        'channel-general',
        'Map the rollout by milestone.',
      );
    });

    await waitFor(() => {
      expect(api.getChannelThread).toHaveBeenCalledWith(
        authState.user,
        'project-123',
        'channel-general',
        'thread-2',
      );
    });

    await waitFor(() => {
      expect(api.streamThreadReply).toHaveBeenCalledWith(
        authState.user,
        'project-123',
        'channel-general',
        'thread-2',
        undefined,
        expect.objectContaining({
          onEvent: expect.any(Function),
        }),
        undefined,
      );
    });

    expect(screen.getByText('Working through it.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/reply to this thread/i), {
      target: { value: 'Give me the first step.' },
    });
    fireEvent.keyDown(screen.getByLabelText(/reply to this thread/i), { key: 'Enter', metaKey: true });

    await waitFor(() => {
      expect(
        api.streamThreadReply.mock.calls.some(
          (call) =>
            call[0] === authState.user &&
            call[1] === 'project-123' &&
            call[2] === 'channel-general' &&
            call[3] === 'thread-2' &&
            call[4] === 'Give me the first step.' &&
            typeof call[5]?.onEvent === 'function' &&
            call[6] === undefined,
        ),
      ).toBe(true);
    });

    expect(screen.getByText('Map the rollout by milestone.')).toBeTruthy();
    expect(screen.queryByText('Working through it. (Give me the first step.)')).toBeTruthy();
    expect(screen.getAllByText(/^Working through it\.$/)).toHaveLength(1);
  });

  it('submits a new post on Cmd+Enter in the composer', async () => {
    window.history.pushState({}, '', '/chat/project-123');

    renderApp();

    await screen.findByRole('button', {
      name: /open thread for ship the mindspace shell this sprint\./i,
    });

    const composer = screen.getByLabelText(/start a post/i);
    fireEvent.change(composer, { target: { value: 'Keyboard shortcut test.' } });
    fireEvent.keyDown(composer, { key: 'Enter', metaKey: true });

    await waitFor(() => {
      expect(api.createChannelPost).toHaveBeenCalledWith(
        authState.user,
        'project-123',
        'channel-general',
        'Keyboard shortcut test.',
      );
    });
  });

  it('submits a thread reply on Ctrl+Enter in the reply box', async () => {
    window.history.pushState({}, '', '/chat/project-123');

    renderApp();

    const postButton = await screen.findByRole('button', {
      name: /open thread for ship the mindspace shell this sprint\./i,
    });
    fireEvent.click(postButton);

    await waitFor(() => {
      expect(api.getChannelThread).toHaveBeenCalled();
    });

    const replyBox = screen.getByLabelText(/reply to this thread/i);
    fireEvent.change(replyBox, { target: { value: 'Ctrl+Enter reply.' } });
    fireEvent.keyDown(replyBox, { key: 'Enter', ctrlKey: true });

    await waitFor(() => {
      expect(api.streamThreadReply).toHaveBeenCalledWith(
        authState.user,
        'project-123',
        'channel-general',
        'thread-1',
        'Ctrl+Enter reply.',
        expect.objectContaining({ onEvent: expect.any(Function) }),
        undefined,
      );
    });
  });

  it('shows loading text while the channel feed is loading', async () => {
    const deferredFeed = createDeferred<{
      channel: {
        id: string;
        name: string;
        slug: string;
      };
      posts: Array<never>;
    }>();

    api.listChannelFeed.mockImplementationOnce(() => deferredFeed.promise);

    window.history.pushState({}, '', '/chat/project-123');
    renderApp();

    await waitFor(() => {
      expect(api.listProjectChannels).toHaveBeenCalled();
    });

    expect(await screen.findByText(/loading feed/i)).toBeTruthy();

    deferredFeed.resolve({
      channel: {
        id: 'channel-general',
        name: 'general',
        slug: 'general',
      },
      posts: [],
    });

    await waitFor(() => {
      expect(screen.queryByText(/loading feed/i)).toBeNull();
    });
  });

  it('renders the inline feed loading spinner without block-level markup', async () => {
    const deferredFeed = createDeferred<{
      channel: {
        id: string;
        name: string;
        slug: string;
      };
      posts: Array<never>;
    }>();

    api.listChannelFeed.mockImplementationOnce(() => deferredFeed.promise);

    window.history.pushState({}, '', '/chat/project-123');
    renderApp();

    await waitFor(() => {
      expect(api.listProjectChannels).toHaveBeenCalled();
    });

    const statusText = await screen.findByText(/loading feed/i);
    const statusContainer = statusText.closest('.channel-status');

    expect(statusContainer).toBeTruthy();

    const spinner = statusContainer?.querySelector('[role="status"]');

    expect(spinner).toBeTruthy();
    expect(spinner?.tagName).toBe('SPAN');

    deferredFeed.resolve({
      channel: {
        id: 'channel-general',
        name: 'general',
        slug: 'general',
      },
      posts: [],
    });
  });

  it('shows an error near the feed when post creation fails and auto-clears it', async () => {
    api.createChannelPost.mockRejectedValueOnce(new Error('Network failure'));

    window.history.pushState({}, '', '/chat/project-123');
    renderApp();

    await screen.findByRole('button', {
      name: /open thread for ship the mindspace shell this sprint\./i,
    });

    fireEvent.change(screen.getByLabelText(/start a post/i), {
      target: { value: 'This will fail.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send to general/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByText(/network error/i)).toBeTruthy();
    });

    await new Promise((resolve) => window.setTimeout(resolve, 8200));

    await waitFor(() => {
      expect(screen.queryByText(/network error/i)).toBeNull();
    });
  }, 15000);

  it('closes the thread drawer when the close button is clicked', async () => {
    window.history.pushState({}, '', '/chat/project-123');
    renderApp();

    const postButton = await screen.findByRole('button', {
      name: /open thread for ship the mindspace shell this sprint\./i,
    });
    fireEvent.click(postButton);

    await waitFor(() => {
      expect(screen.getByText('I can break that into milestones.')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /close thread/i }));

    await waitFor(() => {
      expect(screen.queryByText('I can break that into milestones.')).toBeNull();
    });

    expect(screen.getByText(/choose a thread to open the full conversation/i)).toBeTruthy();
  });

  it('debounces search queries and scopes them to the current channel by default', async () => {
    window.history.pushState({}, '', '/chat/project-123');
    renderApp();

    await screen.findByRole('button', {
      name: /open thread for ship the mindspace shell this sprint\./i,
    });

    fireEvent.click(screen.getByRole('button', { name: /search messages/i }));
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'deploy' },
    });

    expect(api.searchMessages).not.toHaveBeenCalled();

    await new Promise((resolve) => window.setTimeout(resolve, 250));
    expect(api.searchMessages).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(api.searchMessages).toHaveBeenCalledWith(
        authState.user,
        'project-123',
        'deploy',
        { channelId: 'channel-general' },
      );
    });
  });

  it('applies realtime new_thread events to the active channel feed', async () => {
    window.history.pushState({}, '', '/chat/project-123');
    renderApp();

    await screen.findByRole('button', {
      name: /open thread for ship the mindspace shell this sprint\./i,
    });

    await waitFor(() => {
      expect(EventSourceMock.instances.length).toBeGreaterThan(0);
    });

    EventSourceMock.instances[0]!.emit('new_thread', {
      thread: {
        id: 'thread-live',
        channelId: 'channel-general',
        title: null,
        lastMessageAt: '2026-04-09T03:00:00.000Z',
        createdAt: '2026-04-09T03:00:00.000Z',
        updatedAt: '2026-04-09T03:00:00.000Z',
      },
      rootMessage: {
        id: 'message-live',
        role: 'user',
        text: 'Live collaboration update.',
        createdAt: '2026-04-09T03:00:00.000Z',
      },
    });

    expect(await screen.findByRole('button', { name: /open thread for live collaboration update\./i })).toBeTruthy();
  });

  it('opens a search result from another channel and switches the active channel', async () => {
    api.searchMessages.mockResolvedValueOnce({
      results: [
        {
          messageId: 'search-msg-cross-channel',
          threadId: 'thread-3',
          channelId: 'channel-engineering',
          channelName: 'engineering',
          messageText: 'Matched: roadmap',
          threadTitle: 'Roadmap planning',
          role: 'assistant',
          createdAt: '2026-04-09T00:03:00.000Z',
        },
      ],
    });

    window.history.pushState({}, '', '/chat/project-123');
    renderApp();

    await screen.findByRole('button', {
      name: /open thread for ship the mindspace shell this sprint\./i,
    });

    fireEvent.click(screen.getByRole('button', { name: /search messages/i }));
    fireEvent.click(screen.getByRole('button', { name: /all channels/i }));
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'roadmap' },
    });

    const resultButton = await screen.findByRole('button', { name: /open thread: roadmap planning/i });
    fireEvent.click(resultButton);

    await waitFor(() => {
      expect(api.getChannelThread).toHaveBeenCalledWith(
        authState.user,
        'project-123',
        'channel-engineering',
        'thread-3',
      );
    });

    await waitFor(() => {
      expect(screen.queryByRole('searchbox')).toBeNull();
    });
  });
});
