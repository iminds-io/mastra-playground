// ABOUTME: Creates system seed threads that mention the Librarian for orientation and channel guidance
// ABOUTME: Used by channel creation and bootstrap flows to provision an initial thread before streaming

import { randomUUID } from 'node:crypto';

import type { MastraDBMessage, StorageThreadType } from '@mastra/core/memory';

import { createChannelThread, updateChannelThreadMetadata } from '../db/repositories/channel-threads';

type MemoryStore = {
  saveThread(input: { thread: StorageThreadType }): Promise<unknown>;
  saveMessages(input: { messages: MastraDBMessage[] }): Promise<unknown>;
};

export type CreateSeedThreadInput = {
  channelId: string;
  channelName: string;
  projectId: string;
  memoryStore: MemoryStore;
  seedMessage?: string;
};

export type CreateSeedThreadResult = {
  threadId: string;
  channelId: string;
};

function deriveChannelResourceId(channelId: string) {
  return `channel:${channelId}`;
}

function defaultSeedMessage(channelName: string) {
  return `@librarian Give me a thorough usage guide to the #${channelName} channel.`;
}

export async function createSeedThread(input: CreateSeedThreadInput): Promise<CreateSeedThreadResult> {
  const thread = await createChannelThread({
    channelId: input.channelId,
    ownerUserId: null,
  });

  const now = new Date();
  const resourceId = deriveChannelResourceId(input.channelId);
  const messageText = input.seedMessage ?? defaultSeedMessage(input.channelName);

  const storageThread: StorageThreadType = {
    id: thread.id,
    resourceId,
    title: thread.id,
    createdAt: now,
    updatedAt: now,
    metadata: {
      channelId: input.channelId,
      projectId: input.projectId,
      seed: true,
    },
  };

  const rootMessage = {
    id: randomUUID(),
    role: 'user' as const,
    threadId: thread.id,
    resourceId,
    createdAt: now,
    type: 'text' as const,
    content: {
      format: 2 as const,
      content: messageText,
      parts: [
        {
          type: 'text' as const,
          text: messageText,
        },
      ],
    },
  };

  await input.memoryStore.saveThread({ thread: storageThread });
  await input.memoryStore.saveMessages({ messages: [rootMessage] });
  await updateChannelThreadMetadata({
    threadId: thread.id,
    lastMessageAt: now,
  });

  return {
    threadId: thread.id,
    channelId: input.channelId,
  };
}
