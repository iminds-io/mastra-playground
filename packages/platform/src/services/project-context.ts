import { pool } from '../db/client';
import { AccessDeniedError } from './access-control';

export type ProjectContext = {
  actorUserId: string;
  organizationId: string;
  projectId: string;
  role: string;
  resourceId: string;
};

export async function loadProjectContext(input: {
  firebaseUid: string;
  projectId: string;
}): Promise<ProjectContext> {
  const result = await pool.query<{
    actor_user_id: string;
    organization_id: string;
    project_id: string;
    role: string;
  }>(
    `
      select
        users.id as actor_user_id,
        projects.organization_id,
        projects.id as project_id,
        organization_memberships.role
      from users
      inner join organization_memberships
        on organization_memberships.user_id = users.id
      inner join projects
        on projects.organization_id = organization_memberships.organization_id
      where users.firebase_uid = $1
        and projects.id = $2
        and projects.status = 'active'
      limit 1
    `,
    [input.firebaseUid, input.projectId],
  );

  const row = result.rows[0];

  if (!row) {
    throw new AccessDeniedError('User does not have access to this project');
  }

  return {
    actorUserId: row.actor_user_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    role: row.role,
    resourceId: `project:${row.project_id}`,
  };
}
