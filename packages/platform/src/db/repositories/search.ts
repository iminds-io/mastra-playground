// ABOUTME: Searches channel messages by text content using ILIKE on Mastra's message store
// ABOUTME: Joins thread and channel metadata so results can open the right thread in context

import { getDatabasePool } from '../context';

export type SearchResult = {
  messageId: string;
  threadId: string;
  channelId: string;
  channelName: string;
  messageText: string;
  threadTitle: string | null;
  role: string;
  createdAt: string;
};

type SearchResultRow = {
  message_id: string;
  thread_id: string;
  channel_id: string;
  channel_name: string;
  message_text: string;
  thread_title: string | null;
  role: string;
  created_at: Date;
};

function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

export async function searchMessages(input: {
  projectId: string;
  query: string;
  channelId?: string;
  limit: number;
  offset: number;
}): Promise<SearchResult[]> {
  const trimmed = input.query.trim();

  if (!trimmed) {
    return [];
  }

  const escapedQuery = `%${escapeIlike(trimmed)}%`;
  const params: unknown[] = [input.projectId, escapedQuery];
  let paramIndex = 3;
  let channelFilter = '';

  if (input.channelId) {
    channelFilter = `AND ct.channel_id = $${paramIndex}`;
    params.push(input.channelId);
    paramIndex += 1;
  }

  params.push(input.limit, input.offset);

  const sql = `
    SELECT
      m.id AS message_id,
      m.thread_id,
      ct.channel_id,
      pc.name AS channel_name,
      m.content->>'content' AS message_text,
      ct.title AS thread_title,
      m.role,
      m."createdAt" AS created_at
    FROM mastra_messages m
    JOIN channel_threads ct ON ct.id = m.thread_id
    JOIN project_channels pc ON pc.id = ct.channel_id
    WHERE pc.project_id = $1
      AND m.content->>'content' ILIKE $2 ESCAPE '\\'
      ${channelFilter}
      AND ct.status = 'active'
    ORDER BY m."createdAt" DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  const result = await getDatabasePool().query<SearchResultRow>(sql, params);

  return result.rows.map((row) => ({
    messageId: row.message_id,
    threadId: row.thread_id,
    channelId: row.channel_id,
    channelName: row.channel_name,
    messageText: row.message_text,
    threadTitle: row.thread_title,
    role: row.role,
    createdAt: row.created_at.toISOString(),
  }));
}
