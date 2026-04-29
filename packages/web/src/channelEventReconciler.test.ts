import { describe, expect, it } from 'vitest';

import {
  applyNewMessageToThread,
  applyNewThreadToFeed,
  applyThreadUpdatedToFeed,
  applyThreadUpdatedToThread,
} from './channelEventReconciler';

describe('channelEventReconciler', () => {
  it('prepends a new thread to the feed and deduplicates by thread id', () => {
    const posts = applyNewThreadToFeed(
      [
        {
          threadId: 'thread-1',
          rootMessageId: 'message-1',
          rootMessageText: 'Existing',
          rootMessageRole: 'user',
          replyCount: 0,
          lastMessageAt: '2026-04-09T00:00:00.000Z',
          createdAt: '2026-04-09T00:00:00.000Z',
        },
      ],
      {
        thread: {
          id: 'thread-2',
          channelId: 'channel-1',
          title: null,
          lastMessageAt: '2026-04-09T01:00:00.000Z',
          createdAt: '2026-04-09T01:00:00.000Z',
          updatedAt: '2026-04-09T01:00:00.000Z',
        },
        rootMessage: {
          id: 'message-2',
          role: 'user',
          text: 'New',
          createdAt: '2026-04-09T01:00:00.000Z',
        },
      },
    );

    expect(posts[0]?.threadId).toBe('thread-2');
    expect(posts).toHaveLength(2);
  });

  it('appends a new thread message only once', () => {
    const message = {
      id: 'message-2',
      role: 'assistant',
      text: 'Hello',
      createdAt: '2026-04-09T01:00:00.000Z',
    };

    const messages = applyNewMessageToThread(
      [
        {
          id: 'message-1',
          role: 'user',
          text: 'Hi',
          createdAt: '2026-04-09T00:00:00.000Z',
        },
      ],
      {
        threadId: 'thread-1',
        message,
      },
    );

    expect(messages).toHaveLength(2);
    expect(
      applyNewMessageToThread(messages, {
        threadId: 'thread-1',
        message,
      }),
    ).toHaveLength(2);
  });

  it('updates feed and thread timestamps for thread_updated events', () => {
    const feed = applyThreadUpdatedToFeed(
      [
        {
          threadId: 'thread-1',
          rootMessageId: 'message-1',
          rootMessageText: 'Existing',
          rootMessageRole: 'user',
          replyCount: 0,
          lastMessageAt: '2026-04-09T00:00:00.000Z',
          createdAt: '2026-04-09T00:00:00.000Z',
        },
      ],
      {
        threadId: 'thread-1',
        lastMessageAt: '2026-04-09T02:00:00.000Z',
        replyCount: 4,
      },
    );

    expect(feed[0]?.replyCount).toBe(4);
    expect(feed[0]?.lastMessageAt).toBe('2026-04-09T02:00:00.000Z');

    const thread = applyThreadUpdatedToThread(
      {
        id: 'thread-1',
        channelId: 'channel-1',
        title: null,
        lastMessageAt: '2026-04-09T00:00:00.000Z',
        createdAt: '2026-04-09T00:00:00.000Z',
        updatedAt: '2026-04-09T00:00:00.000Z',
      },
      {
        threadId: 'thread-1',
        lastMessageAt: '2026-04-09T02:00:00.000Z',
      },
    );

    expect(thread?.updatedAt).toBe('2026-04-09T02:00:00.000Z');
  });
});
