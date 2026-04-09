// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  bootstrapProject: vi.fn(async () => ({
    projectId: 'project-123',
    organizationId: 'org-123',
    workspaceRootPath: '/tmp/project-123',
    binding: {
      activeAgentRef: 'default',
      activeAgentVersion: 'v1',
    },
    defaultChannelId: 'channel-general',
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
    ],
  })),
  createProjectChannel: vi.fn(async (_user: unknown, _projectId: string, name: string) => ({
    channel: {
      id: 'channel-engineering',
      name,
      slug: name.toLowerCase(),
    },
  })),
  listChannelThreads: vi.fn(async () => ({
    threads: [
      {
        id: 'thread-1',
        channelId: 'channel-general',
        title: 'Kickoff',
        lastMessageAt: '2026-04-09T00:00:00.000Z',
        createdAt: '2026-04-09T00:00:00.000Z',
        updatedAt: '2026-04-09T00:00:00.000Z',
      },
    ],
  })),
  createChannelThread: vi.fn(async (_user: unknown, _projectId: string, channelId: string, title: string) => ({
    thread: {
      id: 'thread-2',
      channelId,
      title,
      lastMessageAt: null,
      createdAt: '2026-04-09T00:00:00.000Z',
      updatedAt: '2026-04-09T00:00:00.000Z',
    },
  })),
  getChannelThread: vi.fn(async () => ({
    thread: {
      id: 'thread-1',
      channelId: 'channel-general',
      title: 'Kickoff',
      lastMessageAt: '2026-04-09T00:00:00.000Z',
      createdAt: '2026-04-09T00:00:00.000Z',
      updatedAt: '2026-04-09T00:00:00.000Z',
    },
    messages: [
      {
        id: 'message-1',
        role: 'assistant',
        text: 'Welcome to the channel.',
        createdAt: '2026-04-09T00:00:00.000Z',
      },
    ],
  })),
  sendChannelMessage: vi.fn(async (_user: unknown, _projectId: string, channelId: string, threadId: string, message: string) => ({
    resourceId: `channel:${channelId}`,
    workspaceRootPath: `/tmp/${threadId}`,
    threadId,
    runId: 'run-456',
    modelId: 'openai/gpt-4.1-mini',
    text: `assistant heard: ${message}`,
  })),
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

  it('bootstraps a project from the admin test route and runs the renamed admin endpoint', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /create demo project/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('project-123')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { value: 'hello admin' },
    });
    fireEvent.click(screen.getByRole('button', { name: /run admin test/i }));

    await waitFor(() => {
      const agentResponse = screen.getByText((content, element) => {
        return (
          element?.tagName === 'PRE' &&
          content.includes('"resourceId": "project:project-123"') &&
          content.includes('"text": "admin heard: hello admin"')
        );
      });

      expect(agentResponse).toBeTruthy();
    });

    expect(api.runAdminTest).toHaveBeenCalledWith(authState.user, 'project-123', 'hello admin');
  });

  it('loads channel threads on the chat route and sends messages to a persisted thread', async () => {
    window.history.pushState({}, '', '/chat/project-123');

    render(<App />);

    await waitFor(() => {
      expect(api.listProjectChannels).toHaveBeenCalledWith(authState.user, 'project-123');
    });

    await waitFor(() => {
      expect(api.listChannelThreads).toHaveBeenCalledWith(authState.user, 'project-123', 'channel-general');
    });

    fireEvent.click(screen.getByRole('button', { name: /kickoff/i }));

    await waitFor(() => {
      expect(api.getChannelThread).toHaveBeenCalledWith(
        authState.user,
        'project-123',
        'channel-general',
        'thread-1',
      );
    });

    fireEvent.change(screen.getByLabelText(/chat message/i), {
      target: { value: 'hello channel' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(screen.getByText('assistant heard: hello channel')).toBeTruthy();
    });

    expect(api.sendChannelMessage).toHaveBeenCalledWith(
      authState.user,
      'project-123',
      'channel-general',
      'thread-1',
      'hello channel',
    );
  });
});
