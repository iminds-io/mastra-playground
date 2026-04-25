import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateChannelThread,
  mockUpdateChannelThreadMetadata,
  mockSaveThread,
  mockSaveMessages,
} = vi.hoisted(() => ({
  mockCreateChannelThread: vi.fn(async () => ({
    id: 'seed-thread-1',
    channel_id: 'channel-1',
    owner_user_id: null,
    title: null,
    status: 'active',
    last_message_at: new Date('2026-04-23T00:00:00.000Z'),
    created_at: new Date('2026-04-23T00:00:00.000Z'),
    updated_at: new Date('2026-04-23T00:00:00.000Z'),
  })),
  mockUpdateChannelThreadMetadata: vi.fn(async () => ({})),
  mockSaveThread: vi.fn(),
  mockSaveMessages: vi.fn(),
}));

vi.mock('../../src/db/repositories/channel-threads', () => ({
  createChannelThread: mockCreateChannelThread,
  updateChannelThreadMetadata: mockUpdateChannelThreadMetadata,
}));

import { createSeedThread } from '../../src/services/channel-seeding';

describe('createSeedThread', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveThread.mockResolvedValue(undefined);
    mockSaveMessages.mockResolvedValue(undefined);
  });

  it('creates a channel thread with null ownerUserId', async () => {
    const memoryStore = {
      saveThread: mockSaveThread,
      saveMessages: mockSaveMessages,
      listMessages: vi.fn(),
    };

    await createSeedThread({
      channelId: 'channel-1',
      channelName: 'engineering',
      projectId: 'project-1',
      memoryStore: memoryStore as never,
    });

    expect(mockCreateChannelThread).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'channel-1',
        ownerUserId: null,
      }),
    );
  });

  it('saves a root message with the @librarian mention for the channel name', async () => {
    const memoryStore = {
      saveThread: mockSaveThread,
      saveMessages: mockSaveMessages,
      listMessages: vi.fn(),
    };

    await createSeedThread({
      channelId: 'channel-1',
      channelName: 'engineering',
      projectId: 'project-1',
      memoryStore: memoryStore as never,
    });

    expect(mockSaveMessages).toHaveBeenCalledOnce();
    const savedMessages = mockSaveMessages.mock.calls[0]?.[0].messages ?? [];
    expect(savedMessages).toHaveLength(1);
    expect(savedMessages[0].role).toBe('user');
    const text = savedMessages[0].content.parts[0].text;
    expect(text).toContain('@librarian');
    expect(text).toContain('#engineering');
  });

  it('returns the seed thread ID', async () => {
    const memoryStore = {
      saveThread: mockSaveThread,
      saveMessages: mockSaveMessages,
      listMessages: vi.fn(),
    };

    const result = await createSeedThread({
      channelId: 'channel-1',
      channelName: 'engineering',
      projectId: 'project-1',
      memoryStore: memoryStore as never,
    });

    expect(result.threadId).toBe('seed-thread-1');
  });

  it('accepts a custom seed message', async () => {
    const memoryStore = {
      saveThread: mockSaveThread,
      saveMessages: mockSaveMessages,
      listMessages: vi.fn(),
    };

    await createSeedThread({
      channelId: 'channel-1',
      channelName: 'general',
      projectId: 'project-1',
      memoryStore: memoryStore as never,
      seedMessage: '@librarian Welcome! Give a brief orientation to this mindspace.',
    });

    const savedMessages = mockSaveMessages.mock.calls[0]?.[0].messages ?? [];
    expect(savedMessages[0].content.parts[0].text).toBe(
      '@librarian Welcome! Give a brief orientation to this mindspace.',
    );
  });
});
