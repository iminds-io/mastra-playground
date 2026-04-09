import { pool } from '../client';

export type ProjectRecord = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  status: string;
};

export async function createProject(input: {
  organizationId: string;
  name: string;
  slug: string;
}): Promise<ProjectRecord> {
  const result = await pool.query<ProjectRecord>(
    `
      insert into projects(organization_id, name, slug)
      values($1, $2, $3)
      returning id, organization_id, name, slug, status
    `,
    [input.organizationId, input.name, input.slug],
  );

  return result.rows[0]!;
}
