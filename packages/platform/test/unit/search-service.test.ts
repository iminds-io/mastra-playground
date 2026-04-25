import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/project-context', () => ({
  loadProjectContext: vi.fn(async () => ({
    actorUserId: 'user-1',
    organizationId: 'org-1',
    projectId: 'project-1',
    role: 'owner',
    resourceId: 'project:project-1',
  })),
}));

const mockSearchMessages = vi.fn();

vi.mock('../../src/db/repositories/search', () => ({
  searchMessages: (...args: unknown[]) => mockSearchMessages(...args),
}));

import { loadProjectContext } from '../../src/services/project-context';
import { searchChannelMessagesForPrincipal } from '../../src/services/search';

describe('searchChannelMessagesForPrincipal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchMessages.mockResolvedValue([]);
  });

  it('checks project access before searching', async () => {
    await searchChannelMessagesForPrincipal({
      firebaseUid: 'firebase-1',
      projectId: 'project-1',
      query: 'deploy',
    });

    expect(loadProjectContext).toHaveBeenCalledWith({
      firebaseUid: 'firebase-1',
      projectId: 'project-1',
    });
  });

  it('delegates to searchMessages with correct params', async () => {
    await searchChannelMessagesForPrincipal({
      firebaseUid: 'firebase-1',
      projectId: 'project-1',
      query: 'deploy',
      channelId: 'channel-1',
      page: 2,
    });

    expect(mockSearchMessages).toHaveBeenCalledWith({
      projectId: 'project-1',
      query: 'deploy',
      channelId: 'channel-1',
      limit: 20,
      offset: 40,
    });
  });

  it('defaults to page 0 when page is not provided', async () => {
    await searchChannelMessagesForPrincipal({
      firebaseUid: 'firebase-1',
      projectId: 'project-1',
      query: 'deploy',
    });

    expect(mockSearchMessages).toHaveBeenCalledWith({
      projectId: 'project-1',
      query: 'deploy',
      channelId: undefined,
      limit: 20,
      offset: 0,
    });
  });

  it('returns results from searchMessages', async () => {
    const mockResults = [
      {
        messageId: 'msg-1',
        threadId: 'thread-1',
        channelId: 'channel-1',
        channelName: 'engineering',
        messageText: 'deploy fix',
        threadTitle: 'Deploy auth fix',
        role: 'user',
        createdAt: '2026-04-20T14:00:00.000Z',
      },
    ];
    mockSearchMessages.mockResolvedValue(mockResults);

    const result = await searchChannelMessagesForPrincipal({
      firebaseUid: 'firebase-1',
      projectId: 'project-1',
      query: 'deploy',
    });

    expect(result.results).toEqual(mockResults);
  });
});
