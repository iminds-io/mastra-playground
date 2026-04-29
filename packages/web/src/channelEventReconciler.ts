import type { ChannelFeedPost, ThreadMessage, ThreadSummary } from './api';

export function applyNewThreadToFeed(
  posts: ChannelFeedPost[],
  input: {
    thread: ThreadSummary;
    rootMessage: ThreadMessage;
  },
): ChannelFeedPost[] {
  return [
    {
      threadId: input.thread.id,
      rootMessageId: input.rootMessage.id,
      rootMessageText: input.rootMessage.text,
      rootMessageRole: input.rootMessage.role,
      replyCount: 0,
      lastMessageAt: input.thread.lastMessageAt,
      createdAt: input.rootMessage.createdAt,
    },
    ...posts.filter((post) => post.threadId !== input.thread.id),
  ];
}

export function applyNewMessageToThread(
  messages: ThreadMessage[],
  input: {
    threadId: string;
    message: ThreadMessage;
  },
): ThreadMessage[] {
  return messages.some((message) => message.id === input.message.id)
    ? messages
    : [...messages, input.message];
}

export function applyThreadUpdatedToFeed(
  posts: ChannelFeedPost[],
  input: {
    threadId: string;
    lastMessageAt: string;
    replyCount?: number;
  },
): ChannelFeedPost[] {
  return posts.map((post) =>
    post.threadId === input.threadId
      ? {
          ...post,
          lastMessageAt: input.lastMessageAt,
          replyCount: input.replyCount ?? post.replyCount + 1,
        }
      : post,
  );
}

export function applyThreadUpdatedToThread(
  thread: ThreadSummary | null,
  input: {
    threadId: string;
    lastMessageAt: string;
  },
): ThreadSummary | null {
  return thread && thread.id === input.threadId
    ? {
        ...thread,
        lastMessageAt: input.lastMessageAt,
        updatedAt: input.lastMessageAt,
      }
    : thread;
}
