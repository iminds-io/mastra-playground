import { getDatabasePool } from '../context';

export type OrganizationMembershipRecord = {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
};

export type ProjectMembershipRecord = {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
};

export async function addOrganizationMembership(input: {
  organizationId: string;
  userId: string;
  role: string;
}): Promise<OrganizationMembershipRecord> {
  const result = await getDatabasePool().query<OrganizationMembershipRecord>(
    `
      insert into organization_memberships(organization_id, user_id, role)
      values($1, $2, $3)
      on conflict(organization_id, user_id)
      do update set
        role = excluded.role,
        updated_at = now()
      returning id, organization_id, user_id, role
    `,
    [input.organizationId, input.userId, input.role],
  );

  return result.rows[0]!;
}

export async function listProjectMemberships(projectId: string): Promise<ProjectMembershipRecord[]> {
  const result = await getDatabasePool().query<ProjectMembershipRecord>(
    `
      select id, project_id, user_id, role
      from project_memberships
      where project_id = $1
      order by role asc, id asc
    `,
    [projectId],
  );

  return result.rows;
}

export async function getProjectMembership(input: {
  projectId: string;
  userId: string;
}): Promise<ProjectMembershipRecord | null> {
  const result = await getDatabasePool().query<ProjectMembershipRecord>(
    `
      select id, project_id, user_id, role
      from project_memberships
      where project_id = $1
        and user_id = $2
      limit 1
    `,
    [input.projectId, input.userId],
  );

  return result.rows[0] ?? null;
}

export async function addProjectMembership(input: {
  projectId: string;
  userId: string;
  role: string;
}): Promise<ProjectMembershipRecord> {
  const result = await getDatabasePool().query<ProjectMembershipRecord>(
    `
      insert into project_memberships(project_id, user_id, role)
      values($1, $2, $3)
      on conflict(project_id, user_id)
      do update set
        role = excluded.role,
        updated_at = now()
      returning id, project_id, user_id, role
    `,
    [input.projectId, input.userId, input.role],
  );

  return result.rows[0]!;
}

export async function removeProjectMembership(input: {
  projectId: string;
  membershipId: string;
}): Promise<ProjectMembershipRecord | null> {
  const result = await getDatabasePool().query<ProjectMembershipRecord>(
    `
      delete from project_memberships
      where project_id = $1
        and id = $2
      returning id, project_id, user_id, role
    `,
    [input.projectId, input.membershipId],
  );

  return result.rows[0] ?? null;
}
