// ABOUTME: Auth-gated search service for channel messages
// ABOUTME: Validates project access and delegates to the repository with simple paging

import { searchMessages, type SearchResult } from '../db/repositories/search';
import { loadProjectContext } from './project-context';

const PAGE_SIZE = 20;

export async function searchChannelMessagesForPrincipal(input: {
  firebaseUid: string;
  projectId: string;
  query: string;
  channelId?: string;
  page?: number;
}): Promise<{ results: SearchResult[] }> {
  await loadProjectContext({
    firebaseUid: input.firebaseUid,
    projectId: input.projectId,
  });

  const page = input.page ?? 0;
  const results = await searchMessages({
    projectId: input.projectId,
    query: input.query,
    ...(input.channelId ? { channelId: input.channelId } : {}),
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  return { results };
}
