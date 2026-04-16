import { getDatabasePool } from '../context';

export type ProjectRecord = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  status: string;
};

export async function listProjectsForFirebaseUid(firebaseUid: string): Promise<ProjectRecord[]> {
  const result = await getDatabasePool().query<ProjectRecord>(
    `
      select distinct
        projects.id,
        projects.organization_id,
        projects.name,
        projects.slug,
        projects.status
      from projects
      inner join organization_memberships
        on organization_memberships.organization_id = projects.organization_id
      inner join users
        on users.id = organization_memberships.user_id
      where users.firebase_uid = $1
      order by projects.name asc
    `,
    [firebaseUid],
  );

  return result.rows;
}

export async function createProject(input: {
  organizationId: string;
  name: string;
  slug: string;
}): Promise<ProjectRecord> {
  const result = await getDatabasePool().query<ProjectRecord>(
    `
      insert into projects(organization_id, name, slug)
      values($1, $2, $3)
      returning id, organization_id, name, slug, status
    `,
    [input.organizationId, input.name, input.slug],
  );

  return result.rows[0]!;
}
