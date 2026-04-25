// ABOUTME: Tests for the channel event emitter service
// ABOUTME: Verifies subscribe/unsubscribe and channel-scoped event fan-out

import { describe, expect, it, vi } from 'vitest';

import { ChannelEventEmitter } from './channel-event-emitter';

describe('ChannelEventEmitter', () => {
  it('delivers events to subscribers of a specific channel', () => {
    const emitter = new ChannelEventEmitter();
    const listener = vi.fn();

    emitter.subscribe('ch-1', listener);
    const event = {
      event: 'heartbeat' as const,
      data: {},
    };

    emitter.emit('ch-1', event);

    expect(listener).toHaveBeenCalledWith(event);
  });

  it('does not deliver events to subscribers of a different channel', () => {
    const emitter = new ChannelEventEmitter();
    const listener = vi.fn();

    emitter.subscribe('ch-2', listener);
    emitter.emit('ch-1', {
      event: 'heartbeat',
      data: {},
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('supports unsubscribe and accurate subscriber counts', () => {
    const emitter = new ChannelEventEmitter();
    const unsubscribe = emitter.subscribe('ch-1', vi.fn());
    emitter.subscribe('ch-1', vi.fn());

    expect(emitter.subscriberCount('ch-1')).toBe(2);

    unsubscribe();

    expect(emitter.subscriberCount('ch-1')).toBe(1);
  });
});
