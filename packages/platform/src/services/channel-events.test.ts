// ABOUTME: Tests that channel event types are correctly defined
// ABOUTME: Guards against accidental changes to the realtime event contract

import { describe, expect, it } from 'vitest';

import type { ChannelEvent, ChannelEventType } from './channel-events';

describe('channel event types', () => {
  it('defines the expected event names', () => {
    const validTypes: ChannelEventType[] = [
      'new_thread',
      'new_message',
      'thread_updated',
      'mind_streaming',
      'heartbeat',
    ];

    expect(validTypes).toHaveLength(5);
  });

  it('defines new_thread with thread and rootMessage fields', () => {
    const event: ChannelEvent = {
      event: 'new_thread',
      data: {
        thread: {
          id: 'thread-1',
          channelId: 'channel-1',
          title: null,
          lastMessageAt: null,
          createdAt: '2026-04-23T00:00:00.000Z',
          updatedAt: '2026-04-23T00:00:00.000Z',
        },
        rootMessage: {
          id: 'msg-1',
          role: 'user',
          text: 'Hello world',
          createdAt: '2026-04-23T00:00:00.000Z',
        },
      },
    };

    expect(event.data.thread.id).toBe('thread-1');
    expect(event.data.rootMessage.id).toBe('msg-1');
  });

  it('defines mind_streaming with a status field', () => {
    const event: ChannelEvent = {
      event: 'mind_streaming',
      data: {
        threadId: 'thread-1',
        mindName: 'Librarian',
        status: 'started',
      },
    };

    expect(event.data.status).toBe('started');
  });
});
