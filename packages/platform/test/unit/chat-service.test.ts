import { beforeEach, describe, expect, it, vi } from 'vitest';

const saveThread = vi.fn();
const saveMessages = vi.fn();

vi.mock('../../src/services/project-context', () => ({
  loadProjectContext: vi.fn(async () => ({
    actorUserId: 'user-1',
    organizationId: 'org-1',
    projectId: 'project-1',
    role: 'owner',
    resourceId: 'project:project-1',
  })),
}));

vi.mock('../../src/db/repositories/project-channels', () => ({
  getProjectChannelById: vi.fn(async () => ({
    id: 'channel-1',
    project_id: 'project-1',
    name: 'engineering',
    slug: 'engineering',
    description: null,
    kind: 'chat',
    is_private: false,
    created_by: 'user-1',
    created_at: new Date('2026-04-09T00:00:00.000Z'),
    updated_at: new Date('2026-04-09T00:00:00.000Z'),
  })),
  listProjectChannels: vi.fn(),
  createProjectChannel: vi.fn(),
}));

vi.mock('../../src/db/repositories/channel-threads', () => ({
  createChannelThread: vi.fn(async () => ({
    id: 'thread-1',
    channel_id: 'channel-1',
    owner_user_id: 'user-1',
    title: null,
    status: 'active',
    last_message_at: new Date('2026-04-09T00:00:00.000Z'),
    created_at: new Date('2026-04-09T00:00:00.000Z'),
    updated_at: new Date('2026-04-09T00:00:00.000Z'),
  })),
  getChannelThreadById: vi.fn(),
  listChannelThreads: vi.fn(),
  updateChannelThreadMetadata: vi.fn(async () => ({
    id: 'thread-1',
    channel_id: 'channel-1',
    owner_user_id: 'user-1',
    title: null,
    status: 'active',
    last_message_at: new Date('2026-04-09T00:00:00.000Z'),
    created_at: new Date('2026-04-09T00:00:00.000Z'),
    updated_at: new Date('2026-04-09T00:00:00.000Z'),
  })),
}));

import { createChannelPostForPrincipal } from '../../src/services/chat';

describe('createChannelPostForPrincipal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveThread.mockResolvedValue(undefined);
    saveMessages.mockResolvedValue(undefined);
  });

  it('saves a non-null internal thread title for Mastra storage', async () => {
    await createChannelPostForPrincipal(
      {
        firebaseUid: 'firebase-user-1',
        projectId: 'project-1',
        channelId: 'channel-1',
        message: 'Ship the mindspace shell this sprint.',
      },
      {
        mastra: {
          getStorage() {
            return {
              getStore: vi.fn(async () => ({
                saveThread,
                saveMessages,
              })),
            };
          },
        } as never,
        mindspaceFactory: vi.fn(async () => ({ filesystem: {} }) as never),
      },
    );

    expect(saveThread).toHaveBeenCalledWith({
      thread: expect.objectContaining({
        id: 'thread-1',
        resourceId: 'channel:channel-1',
        title: expect.any(String),
      }),
    });
    expect(saveThread.mock.calls[0]?.[0]?.thread.title).not.toBeNull();
    expect(saveThread.mock.calls[0]?.[0]?.thread.title).not.toBe('');
  });
});
