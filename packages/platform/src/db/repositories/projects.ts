import { getDatabasePool } from '../context';

export type ProjectRecord = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  status: string;
};

export type ProjectDetailRecord = ProjectRecord & {
  created_at: Date;
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
      inner join project_memberships
        on project_memberships.project_id = projects.id
      inner join users
        on users.id = project_memberships.user_id
      where users.firebase_uid = $1
      order by projects.name asc
    `,
    [firebaseUid],
  );

  return result.rows;
}

export async function listAllProjects(): Promise<ProjectRecord[]> {
  const result = await getDatabasePool().query<ProjectRecord>(
    `
      select
        id,
        organization_id,
        name,
        slug,
        status
      from projects
      order by name asc
    `,
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

export async function getProjectById(projectId: string): Promise<ProjectRecord | null> {
  const result = await getDatabasePool().query<ProjectRecord>(
    `
      select id, organization_id, name, slug, status
      from projects
      where id = $1
      limit 1
    `,
    [projectId],
  );

  return result.rows[0] ?? null;
}

export async function getProjectDetail(projectId: string): Promise<ProjectDetailRecord | null> {
  const result = await getDatabasePool().query<ProjectDetailRecord>(
    `
      select id, organization_id, name, slug, status, created_at
      from projects
      where id = $1
      limit 1
    `,
    [projectId],
  );

  return result.rows[0] ?? null;
}

export async function updateProjectName(input: {
  projectId: string;
  name: string;
}): Promise<ProjectRecord> {
  const result = await getDatabasePool().query<ProjectRecord>(
    `
      update projects
      set name = $2,
          updated_at = now()
      where id = $1
      returning id, organization_id, name, slug, status
    `,
    [input.projectId, input.name],
  );

  return result.rows[0]!;
}

export async function archiveProject(projectId: string): Promise<ProjectRecord> {
  const result = await getDatabasePool().query<ProjectRecord>(
    `
      update projects
      set status = 'archived',
          updated_at = now()
      where id = $1
      returning id, organization_id, name, slug, status
    `,
    [projectId],
  );

  return result.rows[0]!;
}
