// ABOUTME: In-memory event fan-out for channel-level realtime subscribers
// ABOUTME: Scoped to a single runtime instance; cross-instance fan-out needs external pub/sub

import type { ChannelEvent } from './channel-events';

export type ChannelEventListener = (event: ChannelEvent) => void;

export class ChannelEventEmitter {
  private channels = new Map<string, Set<ChannelEventListener>>();

  subscribe(channelId: string, listener: ChannelEventListener): () => void {
    let listeners = this.channels.get(channelId);
    if (!listeners) {
      listeners = new Set();
      this.channels.set(channelId, listeners);
    }

    listeners.add(listener);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.channels.delete(channelId);
      }
    };
  }

  emit(channelId: string, event: ChannelEvent): void {
    const listeners = this.channels.get(channelId);
    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(event);
    }
  }

  subscriberCount(channelId: string): number {
    return this.channels.get(channelId)?.size ?? 0;
  }
}
