// ABOUTME: Frontend mirror of the channel-level realtime event contract
// ABOUTME: Used by the EventSource hook and App state reducers

import type { ThreadMessage, ThreadSummary } from './api';

export type ChannelEventType =
  | 'new_thread'
  | 'new_message'
  | 'thread_updated'
  | 'mind_streaming'
  | 'heartbeat';

export type ChannelEventMap = {
  new_thread: {
    thread: ThreadSummary;
    rootMessage: ThreadMessage;
  };
  new_message: {
    threadId: string;
    message: ThreadMessage;
  };
  thread_updated: {
    threadId: string;
    lastMessageAt: string;
    replyCount: number;
  };
  mind_streaming: {
    threadId: string;
    mindName: string;
    status: 'started' | 'done';
  };
  heartbeat: Record<string, never>;
};

export type ChannelEvent = {
  [K in ChannelEventType]: {
    event: K;
    data: ChannelEventMap[K];
  };
}[ChannelEventType];
