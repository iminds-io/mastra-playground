import { randomUUID } from 'node:crypto';

import type { Mastra } from '@mastra/core';
import { RequestContext } from '@mastra/core/request-context';
import type { MastraDBMessage, StorageThreadType } from '@mastra/core/memory';

import { AccessDeniedError } from './access-control';
import { createProjectChannel, getProjectChannelById, listProjectChannels } from '../db/repositories/project-channels';
import { getChannelThreadById, listChannelThreads, createChannelThread, updateChannelThreadMetadata } from '../db/repositories/channel-threads';
import { loadProjectContext } from './project-context';
import { getWorkspaceFactory } from '../workspace/workspace-context';
import { resolveWorkspaceForProject } from '../workspace/resolver';
import type { ProjectAgentRequestContext } from '../mastra/execution/request-context';

type ChatServiceDeps = {
  mastra: Mastra;
};

export type ChatChannelSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  kind: string;
  isPrivate: boolean;
};

export type ChatThreadSummary = {
  id: string;
  channelId: string;
  title: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessageRecord = {
  id: string;
  role: string;
  text: string;
  createdAt: string;
};

export type ChatThreadDetails = {
  thread: ChatThreadSummary;
  messages: ChatMessageRecord[];
};

export type ChatFeedPost = {
  threadId: string;
  rootMessageId: string;
  rootMessageText: string;
  rootMessageRole: string;
  replyCount: number;
  lastMessageAt: string | null;
  createdAt: string;
};

export type ChatReply = {
  resourceId: string;
  workspaceRootPath: string;
  threadId: string;
  runId?: string;
  modelId?: string;
  text: string;
};

export type ChatStreamEvent = {
  event: 'ack' | 'token' | 'message_saved' | 'thread_updated' | 'done' | 'error';
  data: Record<string, unknown>;
};

function toChannelSummary(row: Awaited<ReturnType<typeof listProjectChannels>>[number]): ChatChannelSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    kind: row.kind,
    isPrivate: row.is_private,
  };
}

function toThreadSummary(row: Awaited<ReturnType<typeof listChannelThreads>>[number]): ChatThreadSummary {
  return {
    id: row.id,
    channelId: row.channel_id,
    title: row.title,
    lastMessageAt: row.last_message_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function deriveChannelResourceId(channelId: string) {
  return `channel:${channelId}`;
}

function slugifyChannelName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function extractMessageText(message: MastraDBMessage): string {
  const parts = message.content.parts ?? [];
  const text = parts
    .flatMap((part) => {
      if (part.type === 'text' && 'text' in part && typeof part.text === 'string') {
        return [part.text];
      }

      return [];
    })
    .join('\n')
    .trim();

  if (text) {
    return text;
  }

  if (typeof message.content.content === 'string') {
    return message.content.content;
  }

  return '';
}

function toChatMessages(messages: MastraDBMessage[]): ChatMessageRecord[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    text: extractMessageText(message),
    createdAt: message.createdAt.toISOString(),
  }));
}

function deriveThreadTitle(message: string) {
  return message.trim().replace(/\s+/g, ' ').slice(0, 72) || 'New thread';
}

function createTextMessage(input: {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  threadId: string;
  resourceId: string;
  createdAt?: Date;
}): MastraDBMessage {
  const createdAt = input.createdAt ?? new Date();

  return {
    id: input.id ?? randomUUID(),
    role: input.role,
    threadId: input.threadId,
    resourceId: input.resourceId,
    createdAt,
    type: 'text',
    content: {
      format: 2,
      content: input.text,
      parts: [
        {
          type: 'text',
          text: input.text,
        },
      ],
    },
  };
}

async function getMemoryStore(mastra: Mastra) {
  const storage = mastra.getStorage();
  const memory = await storage?.getStore('memory');

  if (!memory) {
    throw new Error('Mastra memory storage is not configured.');
  }

  return memory;
}

async function requireProjectChannel(input: {
  firebaseUid: string;
  projectId: string;
  channelId: string;
}) {
  const projectContext = await loadProjectContext({
    firebaseUid: input.firebaseUid,
    projectId: input.projectId,
  });
  const channel = await getProjectChannelById({
    projectId: input.projectId,
    channelId: input.channelId,
  });

  if (!channel) {
    throw new AccessDeniedError('Channel not found');
  }

  return {
    projectContext,
    channel,
  };
}

async function buildExecutionContext(input: {
  projectId: string;
  projectContext: Awaited<ReturnType<typeof loadProjectContext>>;
  channelId: string;
  threadId: string;
}) {
  const resolvedWorkspace = await resolveWorkspaceForProject(input.projectId);
  const runtimeWorkspace = await getWorkspaceFactory()(resolvedWorkspace.root.root_path);
  const requestContext = new RequestContext<ProjectAgentRequestContext>();
  const resourceId = deriveChannelResourceId(input.channelId);

  requestContext.set('resourceId', input.projectContext.resourceId);
  requestContext.set('actorUserId', input.projectContext.actorUserId);
  requestContext.set('organizationId', input.projectContext.organizationId);
  requestContext.set('projectId', input.projectContext.projectId);
  requestContext.set('role', input.projectContext.role);
  requestContext.set('workspace', runtimeWorkspace);
  requestContext.set('channelId', input.channelId);
  requestContext.set('currentThreadId', input.threadId);
  requestContext.set('mastra__resourceId', resourceId);
  requestContext.set('mastra__threadId', input.threadId);

  return {
    requestContext,
    resourceId,
    workspaceRootPath: resolvedWorkspace.root.root_path,
  };
}

export async function listProjectChannelsForPrincipal(input: {
  firebaseUid: string;
  projectId: string;
}) {
  await loadProjectContext({
    firebaseUid: input.firebaseUid,
    projectId: input.projectId,
  });

  const channels = await listProjectChannels(input.projectId);

  return {
    channels: channels.map(toChannelSummary),
  };
}

export async function listChannelFeedForPrincipal(input: {
  firebaseUid: string;
  projectId: string;
  channelId: string;
}, deps: ChatServiceDeps): Promise<{
  channel: ChatChannelSummary;
  posts: ChatFeedPost[];
}> {
  const { channel } = await requireProjectChannel(input);
  const threads = await listChannelThreads(input.channelId);
  const memoryStore = await getMemoryStore(deps.mastra);
  const resourceId = deriveChannelResourceId(channel.id);

  const posts = await Promise.all(
    threads.map(async (thread) => {
      const messageResult = await memoryStore.listMessages({
        threadId: thread.id,
        resourceId,
        perPage: false,
        page: 0,
        orderBy: {
          field: 'createdAt',
          direction: 'ASC',
        },
      });
      const [rootMessage, ...replies] = messageResult.messages;

      return {
        threadId: thread.id,
        rootMessageId: rootMessage?.id ?? thread.id,
        rootMessageText: rootMessage ? extractMessageText(rootMessage) : '',
        rootMessageRole: rootMessage?.role ?? 'user',
        replyCount: replies.length,
        lastMessageAt: thread.last_message_at?.toISOString() ?? null,
        createdAt: (rootMessage?.createdAt ?? thread.created_at).toISOString(),
      } satisfies ChatFeedPost;
    }),
  );

  return {
    channel: toChannelSummary(channel),
    posts,
  };
}

export async function createProjectChannelForPrincipal(input: {
  firebaseUid: string;
  projectId: string;
  name: string;
  description?: string | null;
}) {
  const projectContext = await loadProjectContext({
    firebaseUid: input.firebaseUid,
    projectId: input.projectId,
  });
  const name = input.name.trim();

  if (!name) {
    throw new AccessDeniedError('Channel name is required');
  }

  const slug = slugifyChannelName(name);

  if (!slug) {
    throw new AccessDeniedError('Channel name must contain letters or numbers');
  }

  const channel = await createProjectChannel({
    projectId: projectContext.projectId,
    name,
    slug,
    description: input.description ?? null,
    createdBy: projectContext.actorUserId,
  });

  return {
    channel: toChannelSummary(channel),
  };
}

export async function createChannelPostForPrincipal(input: {
  firebaseUid: string;
  projectId: string;
  channelId: string;
  message: string;
}, deps: ChatServiceDeps): Promise<{
  thread: ChatThreadSummary;
  rootMessage: ChatMessageRecord;
}> {
  const { projectContext, channel } = await requireProjectChannel(input);
  const text = input.message.trim();

  if (!text) {
    throw new AccessDeniedError('Post message is required');
  }

  const thread = await createChannelThread({
    channelId: channel.id,
    ownerUserId: projectContext.actorUserId,
    title: null,
  });
  const memoryStore = await getMemoryStore(deps.mastra);
  const now = new Date();
  const resourceId = deriveChannelResourceId(channel.id);
  const storageThread: StorageThreadType = {
    id: thread.id,
    resourceId,
    title: thread.id,
    createdAt: now,
    updatedAt: now,
    metadata: {
      channelId: channel.id,
      projectId: projectContext.projectId,
    },
  };
  const rootMessage = createTextMessage({
    role: 'user',
    text,
    threadId: thread.id,
    resourceId,
    createdAt: now,
  });

  await memoryStore.saveThread({ thread: storageThread });
  await memoryStore.saveMessages({ messages: [rootMessage] });
  await updateChannelThreadMetadata({
    threadId: thread.id,
    lastMessageAt: now,
  });

  return {
    thread: {
      ...toThreadSummary(thread),
      lastMessageAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    rootMessage: toChatMessages([rootMessage])[0]!,
  };
}

export async function listChannelThreadsForPrincipal(input: {
  firebaseUid: string;
  projectId: string;
  channelId: string;
}) {
  await requireProjectChannel(input);

  const threads = await listChannelThreads(input.channelId);

  return {
    threads: threads.map(toThreadSummary),
  };
}

export async function createChannelThreadForPrincipal(input: {
  firebaseUid: string;
  projectId: string;
  channelId: string;
  title?: string | null;
}, deps: ChatServiceDeps) {
  const { projectContext, channel } = await requireProjectChannel(input);
  const thread = await createChannelThread({
    channelId: channel.id,
    ownerUserId: projectContext.actorUserId,
    title: input.title?.trim() || 'New thread',
  });
  const memoryStore = await getMemoryStore(deps.mastra);
  const now = new Date();
  const storageThread: StorageThreadType = {
    id: thread.id,
    resourceId: deriveChannelResourceId(channel.id),
    createdAt: now,
    updatedAt: now,
    metadata: {
      channelId: channel.id,
      projectId: projectContext.projectId,
    },
    ...(thread.title ? { title: thread.title } : {}),
  };

  await memoryStore.saveThread({
    thread: storageThread,
  });

  return {
    thread: toThreadSummary(thread),
  };
}

export async function getChannelThreadForPrincipal(input: {
  firebaseUid: string;
  projectId: string;
  channelId: string;
  threadId: string;
}, deps: ChatServiceDeps): Promise<ChatThreadDetails> {
  const { channel } = await requireProjectChannel(input);
  const thread = await getChannelThreadById({
    channelId: channel.id,
    threadId: input.threadId,
  });

  if (!thread) {
    throw new AccessDeniedError('Thread not found');
  }

  const memoryStore = await getMemoryStore(deps.mastra);
  const messages = await memoryStore.listMessages({
    threadId: thread.id,
    resourceId: deriveChannelResourceId(channel.id),
    perPage: false,
    page: 0,
    orderBy: {
      field: 'createdAt',
      direction: 'ASC',
    },
  });

  return {
    thread: toThreadSummary(thread),
    messages: toChatMessages(messages.messages),
  };
}

export async function sendChannelMessageForPrincipal(input: {
  firebaseUid: string;
  projectId: string;
  channelId: string;
  threadId: string;
  message: string;
}, deps: ChatServiceDeps): Promise<ChatReply> {
  const { projectContext, channel } = await requireProjectChannel(input);
  const thread = await getChannelThreadById({
    channelId: channel.id,
    threadId: input.threadId,
  });

  if (!thread) {
    throw new AccessDeniedError('Thread not found');
  }

  const execution = await buildExecutionContext({
    projectId: input.projectId,
    projectContext,
    channelId: channel.id,
    threadId: thread.id,
  });

  const output = await deps.mastra.getAgent('projectAgent').generate(input.message, {
    requestContext: execution.requestContext,
    memory: {
      thread: thread.id,
      resource: execution.resourceId,
    },
  });

  await updateChannelThreadMetadata({
    threadId: thread.id,
    lastMessageAt: new Date(),
  });

  return {
    resourceId: execution.resourceId,
    workspaceRootPath: execution.workspaceRootPath,
    threadId: thread.id,
    text: output.text,
    ...(output.runId ? { runId: output.runId } : {}),
    ...(output.response?.modelId ? { modelId: output.response.modelId } : {}),
  };
}

export async function* streamChannelReplyForPrincipal(input: {
  firebaseUid: string;
  projectId: string;
  channelId: string;
  threadId: string;
  message?: string;
}, deps: ChatServiceDeps): AsyncGenerator<ChatStreamEvent> {
  const { projectContext, channel } = await requireProjectChannel(input);
  const thread = await getChannelThreadById({
    channelId: channel.id,
    threadId: input.threadId,
  });

  if (!thread) {
    throw new AccessDeniedError('Thread not found');
  }

  const execution = await buildExecutionContext({
    projectId: input.projectId,
    projectContext,
    channelId: channel.id,
    threadId: thread.id,
  });
  const memoryStore = await getMemoryStore(deps.mastra);
  const messageInput = input.message?.trim()
    ? input.message.trim()
    : (
        await memoryStore.listMessages({
          threadId: thread.id,
          resourceId: execution.resourceId,
          perPage: false,
          page: 0,
          orderBy: {
            field: 'createdAt',
            direction: 'ASC',
          },
        })
      ).messages;
  const stream = await deps.mastra.getAgent('projectAgent').stream(messageInput, {
    requestContext: execution.requestContext,
    memory: {
      thread: thread.id,
      resource: execution.resourceId,
    },
  });

  yield {
    event: 'ack',
    data: {
      threadId: thread.id,
      resourceId: execution.resourceId,
      workspaceRootPath: execution.workspaceRootPath,
    },
  };

  for await (const token of stream.textStream) {
    yield {
      event: 'token',
      data: {
        text: token,
      },
    };
  }

  const output = await stream.getFullOutput();
  const assistantMessage = output.response?.dbMessages
    ?.filter((message) => message.role === 'assistant')
    .at(-1);
  const lastMessageAt = assistantMessage?.createdAt ?? new Date();

  await updateChannelThreadMetadata({
    threadId: thread.id,
    lastMessageAt,
  });

  if (assistantMessage) {
    yield {
      event: 'message_saved',
      data: {
        id: assistantMessage.id,
        role: assistantMessage.role,
        text: extractMessageText(assistantMessage),
        createdAt: assistantMessage.createdAt.toISOString(),
      },
    };
  }

  yield {
    event: 'thread_updated',
    data: {
      threadId: thread.id,
      lastMessageAt: lastMessageAt.toISOString(),
      modelId: output.response?.modelId,
      runId: output.runId,
    },
  };
  yield {
    event: 'done',
    data: {
      threadId: thread.id,
      text: output.text,
      ...(output.response?.modelId ? { modelId: output.response.modelId } : {}),
      ...(output.runId ? { runId: output.runId } : {}),
    },
  };
}
