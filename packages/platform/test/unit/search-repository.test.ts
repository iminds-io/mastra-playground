import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../src/db/context', () => ({
  getDatabasePool: () => ({ query: mockQuery }),
}));

import { searchMessages, type SearchResult } from '../../src/db/repositories/search';

describe('searchMessages', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns empty array for empty query', async () => {
    expect(
      await searchMessages({
        projectId: 'project-1',
        query: '',
        limit: 20,
        offset: 0,
      }),
    ).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns empty array for whitespace-only query', async () => {
    expect(
      await searchMessages({
        projectId: 'project-1',
        query: '   ',
        limit: 20,
        offset: 0,
      }),
    ).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('queries with ILIKE when query is provided', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await searchMessages({ projectId: 'project-1', query: 'deploy', limit: 20, offset: 0 });
    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(sql).toContain('ILIKE');
    expect(params).toContain('%deploy%');
  });

  it('scopes to channel when channelId is provided', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await searchMessages({ projectId: 'project-1', query: 'deploy', channelId: 'channel-1', limit: 20, offset: 0 });
    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(sql).toContain('channel_id');
    expect(params).toContain('channel-1');
  });

  it('maps rows to SearchResult shape', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          message_id: 'msg-1',
          thread_id: 'thread-1',
          channel_id: 'channel-1',
          channel_name: 'engineering',
          message_text: 'deploy the auth fix today',
          thread_title: 'Deploy auth fix',
          role: 'user',
          created_at: new Date('2026-04-20T14:00:00Z'),
        },
      ],
      rowCount: 1,
    });

    const results = await searchMessages({
      projectId: 'project-1',
      query: 'deploy',
      limit: 20,
      offset: 0,
    });

    const result: SearchResult = results[0]!;
    expect(result.messageId).toBe('msg-1');
    expect(result.threadId).toBe('thread-1');
    expect(result.channelId).toBe('channel-1');
    expect(result.channelName).toBe('engineering');
    expect(result.messageText).toBe('deploy the auth fix today');
    expect(result.threadTitle).toBe('Deploy auth fix');
    expect(result.role).toBe('user');
    expect(result.createdAt).toBe('2026-04-20T14:00:00.000Z');
  });

  it('applies limit and offset', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await searchMessages({ projectId: 'project-1', query: 'deploy', limit: 10, offset: 20 });
    const [, params] = mockQuery.mock.calls[0]!;
    expect(params).toContain(10);
    expect(params).toContain(20);
  });

  it('escapes ILIKE wildcard characters in query', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await searchMessages({ projectId: 'project-1', query: '100%_done', limit: 20, offset: 0 });
    const [, params] = mockQuery.mock.calls[0]!;
    const likeParam = params.find((value: unknown) => typeof value === 'string' && value.startsWith('%'));
    expect(likeParam).toContain('100\\%\\_done');
  });
});
