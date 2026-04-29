import type {
  ChannelFeedPost,
  ChannelSummary,
  ThreadDetails,
} from '../api';
import { getChannelThread, listChannelFeed, listProjectChannels } from '../api';

type AuthUser = {
  getIdToken(): Promise<string>;
};

export const chatQueryKeys = {
  channels(projectId: string) {
    return ['projects', projectId, 'channels'] as const;
  },
  feed(projectId: string, channelId: string) {
    return ['projects', projectId, 'channels', channelId, 'feed'] as const;
  },
  thread(projectId: string, channelId: string, threadId: string) {
    return ['projects', projectId, 'channels', channelId, 'threads', threadId] as const;
  },
};

export async function fetchProjectChannels(user: AuthUser, projectId: string): Promise<ChannelSummary[]> {
  const result = await listProjectChannels(user, projectId);
  return result.channels;
}

export async function fetchChannelFeed(
  user: AuthUser,
  projectId: string,
  channelId: string,
): Promise<ChannelFeedPost[]> {
  const result = await listChannelFeed(user, projectId, channelId);
  return result.posts;
}

export async function fetchChannelThread(
  user: AuthUser,
  projectId: string,
  channelId: string,
  threadId: string,
): Promise<ThreadDetails> {
  return getChannelThread(user, projectId, channelId, threadId);
}
