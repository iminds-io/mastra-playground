import { pool } from '../client';

export type ChannelThreadRecord = {
  id: string;
  channel_id: string;
  owner_user_id: string | null;
  title: string | null;
  status: string;
  last_message_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export async function createChannelThread(input: {
  channelId: string;
  ownerUserId?: string | null;
  title?: string | null;
}): Promise<ChannelThreadRecord> {
  const result = await pool.query<ChannelThreadRecord>(
    `
      insert into channel_threads(channel_id, owner_user_id, title, last_message_at)
      values($1, $2, $3, now())
      returning id, channel_id, owner_user_id, title, status, last_message_at, created_at, updated_at
    `,
    [input.channelId, input.ownerUserId ?? null, input.title ?? null],
  );

  return result.rows[0]!;
}

export async function listChannelThreads(channelId: string): Promise<ChannelThreadRecord[]> {
  const result = await pool.query<ChannelThreadRecord>(
    `
      select id, channel_id, owner_user_id, title, status, last_message_at, created_at, updated_at
      from channel_threads
      where channel_id = $1
        and status = 'active'
      order by coalesce(last_message_at, created_at) desc, created_at desc
    `,
    [channelId],
  );

  return result.rows;
}

export async function getChannelThreadById(input: {
  channelId: string;
  threadId: string;
}): Promise<ChannelThreadRecord | null> {
  const result = await pool.query<ChannelThreadRecord>(
    `
      select id, channel_id, owner_user_id, title, status, last_message_at, created_at, updated_at
      from channel_threads
      where channel_id = $1
        and id = $2
      limit 1
    `,
    [input.channelId, input.threadId],
  );

  return result.rows[0] ?? null;
}

export async function updateChannelThreadMetadata(input: {
  threadId: string;
  title?: string | null;
  lastMessageAt?: Date;
}): Promise<ChannelThreadRecord> {
  const result = await pool.query<ChannelThreadRecord>(
    `
      update channel_threads
      set
        title = coalesce($2, title),
        last_message_at = coalesce($3, last_message_at),
        updated_at = now()
      where id = $1
      returning id, channel_id, owner_user_id, title, status, last_message_at, created_at, updated_at
    `,
    [input.threadId, input.title ?? null, input.lastMessageAt ?? null],
  );

  return result.rows[0]!;
}
