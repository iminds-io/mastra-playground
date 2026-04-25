// ABOUTME: Shared types for channel-level Server-Sent Events
// ABOUTME: Defines the backend/frontend contract for realtime feed and thread updates

import type { ChatMessageRecord, ChatThreadSummary } from './chat';

export type ChannelEventType =
  | 'new_thread'
  | 'new_message'
  | 'thread_updated'
  | 'mind_streaming'
  | 'heartbeat';

export type NewThreadEventData = {
  thread: ChatThreadSummary;
  rootMessage: ChatMessageRecord;
};

export type NewMessageEventData = {
  threadId: string;
  message: ChatMessageRecord;
};

export type ThreadUpdatedEventData = {
  threadId: string;
  lastMessageAt: string;
  replyCount: number;
};

export type MindStreamingEventData = {
  threadId: string;
  mindName: string;
  status: 'started' | 'done';
};

export type HeartbeatEventData = Record<string, never>;

export type ChannelEventMap = {
  new_thread: NewThreadEventData;
  new_message: NewMessageEventData;
  thread_updated: ThreadUpdatedEventData;
  mind_streaming: MindStreamingEventData;
  heartbeat: HeartbeatEventData;
};

export type ChannelEvent = {
  [K in ChannelEventType]: {
    event: K;
    data: ChannelEventMap[K];
  };
}[ChannelEventType];
