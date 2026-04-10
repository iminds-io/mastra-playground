// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = {
  user: {
    uid: 'firebase-user-1',
    email: 'user@example.com',
    getIdToken: vi.fn(async () => 'demo-token'),
  },
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
        name: 'Alpha Workspace',
        slug: 'alpha-workspace',
        status: 'active',
      },
      {
        id: 'project-456',
        organizationId: 'org-1',
        name: 'Beta Workspace',
        slug: 'beta-workspace',
        status: 'active',
      },
    ],
  })),
  bootstrapProject: vi.fn(async (_user: unknown, name: string) => ({
    projectId: 'project-789',
    organizationId: 'org-123',
    workspaceRootPath: '/tmp/project-789',
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
  getWorkspace: vi.fn(async (_user: unknown, projectId: string) => ({
    projectId,
  })),
  runAdminTest: vi.fn(async (_user: unknown, projectId: string, message: string) => ({
    resourceId: `project:${projectId}`,
    workspaceRootPath: `/tmp/${projectId}`,
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
        rootMessageText: 'Ship the workspace shell this sprint.',
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
        text: 'Ship the workspace shell this sprint.',
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

describe('App', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/admin/test');
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('bootstraps a project from admin and shows the new workspace in the project rail', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /create demo project/i }));

    await waitFor(() => {
      expect(api.bootstrapProject).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: /open chat workspace/i }));

    await waitFor(() => {
      expect(api.listAccessibleProjects).toHaveBeenCalledWith(authState.user);
    });

    expect(await screen.findByRole('button', { name: /alpha workspace/i })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /demo project/i })).toBeTruthy();
  });

  it('renders the channel feed as root posts and opens a thread drawer for replies', async () => {
    window.history.pushState({}, '', '/chat/project-123');

    render(<App />);

    await waitFor(() => {
      expect(api.listAccessibleProjects).toHaveBeenCalledWith(authState.user);
      expect(api.listProjectChannels).toHaveBeenCalledWith(authState.user, 'project-123');
      expect(api.listChannelFeed).toHaveBeenCalledWith(authState.user, 'project-123', 'channel-general');
    });

    expect(
      screen.getByRole('button', { name: /open thread for ship the workspace shell this sprint\./i }),
    ).toBeTruthy();
    expect(screen.getByText(/2 replies/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /open thread for ship the workspace shell this sprint\./i }));

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

  it('creates a new channel post, auto-streams the root response, and clears transient stream text after save', async () => {
    window.history.pushState({}, '', '/chat/project-123');

    render(<App />);

    await screen.findByRole('button', {
      name: /open thread for ship the workspace shell this sprint\./i,
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
      );
    });

    expect(screen.getByText('Working through it.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/reply in thread/i), {
      target: { value: 'Give me the first step.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /reply in thread/i }));

    await waitFor(() => {
      expect(api.streamThreadReply).toHaveBeenCalledWith(
        authState.user,
        'project-123',
        'channel-general',
        'thread-2',
        'Give me the first step.',
        expect.objectContaining({
          onEvent: expect.any(Function),
        }),
      );
    });

    expect(screen.getByText('Map the rollout by milestone.')).toBeTruthy();
    expect(screen.queryByText('Working through it. (Give me the first step.)')).toBeTruthy();
    expect(screen.getAllByText(/^Working through it\.$/)).toHaveLength(1);
  });
});
