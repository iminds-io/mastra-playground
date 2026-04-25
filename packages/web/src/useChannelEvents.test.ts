// @vitest-environment jsdom
// ABOUTME: Tests for the EventSource hook managing channel realtime subscriptions
// ABOUTME: Verifies lifecycle, URL construction, and event dispatch

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useChannelEvents } from './useChannelEvents';

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

describe('useChannelEvents', () => {
  const user = {
    getIdToken: vi.fn(async () => 'demo-token'),
  };

  afterEach(() => {
    EventSourceMock.instances = [];
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('opens an EventSource for the active channel', async () => {
    vi.stubGlobal('EventSource', EventSourceMock);

    renderHook(() =>
      useChannelEvents({
        user,
        projectId: 'project-1',
        channelId: 'channel-1',
        handlers: {},
      }),
    );

    await waitFor(() => {
      expect(EventSourceMock.instances).toHaveLength(1);
    });

    expect(EventSourceMock.instances[0]?.url).toContain('/api/projects/project-1/channels/channel-1/events');
    expect(EventSourceMock.instances[0]?.url).toContain('token=demo-token');
  });

  it('dispatches named events to matching handlers', async () => {
    vi.stubGlobal('EventSource', EventSourceMock);
    const onNewThread = vi.fn();

    renderHook(() =>
      useChannelEvents({
        user,
        projectId: 'project-1',
        channelId: 'channel-1',
        handlers: {
          new_thread: onNewThread,
        },
      }),
    );

    await waitFor(() => {
      expect(EventSourceMock.instances).toHaveLength(1);
    });

    EventSourceMock.instances[0]?.emit('new_thread', {
      thread: {
        id: 'thread-1',
        channelId: 'channel-1',
        title: null,
        lastMessageAt: null,
        createdAt: '2026-04-24T00:00:00.000Z',
        updatedAt: '2026-04-24T00:00:00.000Z',
      },
      rootMessage: {
        id: 'msg-1',
        role: 'user',
        text: 'hello',
        createdAt: '2026-04-24T00:00:00.000Z',
      },
    });

    expect(onNewThread).toHaveBeenCalledWith(
      expect.objectContaining({
        thread: expect.objectContaining({ id: 'thread-1' }),
      }),
    );
  });

  it('closes the previous EventSource on unmount', async () => {
    vi.stubGlobal('EventSource', EventSourceMock);

    const { unmount } = renderHook(() =>
      useChannelEvents({
        user,
        projectId: 'project-1',
        channelId: 'channel-1',
        handlers: {},
      }),
    );

    await waitFor(() => {
      expect(EventSourceMock.instances).toHaveLength(1);
    });

    const instance = EventSourceMock.instances[0]!;
    unmount();

    expect(instance.close).toHaveBeenCalled();
  });
});
