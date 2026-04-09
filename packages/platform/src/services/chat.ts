import { randomUUID } from 'node:crypto';

import type { Mastra } from '@mastra/core';
import { RequestContext } from '@mastra/core/request-context';
import type { MastraDBMessage, StorageThreadType } from '@mastra/core/memory';

import { AccessDeniedError } from './access-control';
import { createProjectChannel, getProjectChannelById, listProjectChannels } from '../db/repositories/project-channels';
import { getChannelThreadById, listChannelThreads, createChannelThread, updateChannelThreadMetadata } from '../db/repositories/channel-threads';
import { loadProjectContext } from './project-context';
import { createRuntimeWorkspace } from '../workspace/factory';
import { resolveWorkspaceForProject } from '../workspace/resolver';
import type { ProjectAgentRequestContext } from '../mastra/execution/request-context';
import type { createProjectAgent } from '../mastra/agents/project-agent';

type ProjectAgentLike = ReturnType<typeof createProjectAgent>;

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

export type ChatReply = {
  resourceId: string;
  workspaceRootPath: string;
  threadId: string;
  runId?: string;
  modelId?: string;
  text: string;
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

  const resolvedWorkspace = await resolveWorkspaceForProject(input.projectId);
  const runtimeWorkspace = await createRuntimeWorkspace(resolvedWorkspace.root.root_path);
  const requestContext = new RequestContext<ProjectAgentRequestContext>();
  const resourceId = deriveChannelResourceId(channel.id);

  requestContext.set('resourceId', projectContext.resourceId);
  requestContext.set('actorUserId', projectContext.actorUserId);
  requestContext.set('organizationId', projectContext.organizationId);
  requestContext.set('projectId', projectContext.projectId);
  requestContext.set('role', projectContext.role);
  requestContext.set('workspace', runtimeWorkspace);
  requestContext.set('channelId', channel.id);
  requestContext.set('currentThreadId', thread.id);
  requestContext.set('mastra__resourceId', resourceId);
  requestContext.set('mastra__threadId', thread.id);

  const output = await deps.mastra.getAgent('projectAgent').generate(input.message, {
    requestContext,
    memory: {
      thread: thread.id,
      resource: resourceId,
    },
  });

  await updateChannelThreadMetadata({
    threadId: thread.id,
    title: thread.title ?? deriveThreadTitle(input.message),
    lastMessageAt: new Date(),
  });

  return {
    resourceId,
    workspaceRootPath: resolvedWorkspace.root.root_path,
    threadId: thread.id,
    text: output.text,
    ...(output.runId ? { runId: output.runId } : {}),
    ...(output.response?.modelId ? { modelId: output.response.modelId } : {}),
  };
}
