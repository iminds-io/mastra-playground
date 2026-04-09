import { pool } from '../client';

export type ProjectChannelRecord = {
  id: string;
  project_id: string;
  name: string;
  slug: string;
  description: string | null;
  kind: string;
  is_private: boolean;
  created_by: string | null;
};

export async function createProjectChannel(input: {
  projectId: string;
  name: string;
  slug: string;
  description?: string | null;
  kind?: string;
  isPrivate?: boolean;
  createdBy?: string | null;
}): Promise<ProjectChannelRecord> {
  const result = await pool.query<ProjectChannelRecord>(
    `
      insert into project_channels(project_id, name, slug, description, kind, is_private, created_by)
      values($1, $2, $3, $4, $5, $6, $7)
      returning id, project_id, name, slug, description, kind, is_private, created_by
    `,
    [
      input.projectId,
      input.name,
      input.slug,
      input.description ?? null,
      input.kind ?? 'chat',
      input.isPrivate ?? false,
      input.createdBy ?? null,
    ],
  );

  return result.rows[0]!;
}

export async function listProjectChannels(projectId: string): Promise<ProjectChannelRecord[]> {
  const result = await pool.query<ProjectChannelRecord>(
    `
      select id, project_id, name, slug, description, kind, is_private, created_by
      from project_channels
      where project_id = $1
      order by name asc
    `,
    [projectId],
  );

  return result.rows;
}

export async function getProjectChannelById(input: {
  projectId: string;
  channelId: string;
}): Promise<ProjectChannelRecord | null> {
  const result = await pool.query<ProjectChannelRecord>(
    `
      select id, project_id, name, slug, description, kind, is_private, created_by
      from project_channels
      where project_id = $1
        and id = $2
      limit 1
    `,
    [input.projectId, input.channelId],
  );

  return result.rows[0] ?? null;
}
