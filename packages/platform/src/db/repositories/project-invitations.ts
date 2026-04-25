import { getDatabasePool } from '../context';

export type ProjectInvitationRecord = {
  id: string;
  project_id: string;
  email: string;
  role: string;
  invited_by_user_id: string | null;
  status: string;
};

export async function createProjectInvitation(input: {
  projectId: string;
  email: string;
  role: string;
  invitedByUserId: string;
}): Promise<ProjectInvitationRecord> {
  const result = await getDatabasePool().query<ProjectInvitationRecord>(
    `
      insert into project_invitations(project_id, email, role, invited_by_user_id)
      values($1, lower($2), $3, $4)
      returning id, project_id, email, role, invited_by_user_id, status
    `,
    [input.projectId, input.email, input.role, input.invitedByUserId],
  );

  return result.rows[0]!;
}

export async function listProjectInvitations(projectId: string): Promise<ProjectInvitationRecord[]> {
  const result = await getDatabasePool().query<ProjectInvitationRecord>(
    `
      select id, project_id, email, role, invited_by_user_id, status
      from project_invitations
      where project_id = $1
      order by created_at desc
    `,
    [projectId],
  );

  return result.rows;
}

export async function revokeProjectInvitation(input: {
  projectId: string;
  invitationId: string;
}): Promise<ProjectInvitationRecord | null> {
  const result = await getDatabasePool().query<ProjectInvitationRecord>(
    `
      update project_invitations
      set status = 'revoked',
          updated_at = now()
      where project_id = $1
        and id = $2
      returning id, project_id, email, role, invited_by_user_id, status
    `,
    [input.projectId, input.invitationId],
  );

  return result.rows[0] ?? null;
}

export async function acceptProjectInvitationsForEmail(input: {
  email: string;
}): Promise<ProjectInvitationRecord[]> {
  const result = await getDatabasePool().query<ProjectInvitationRecord>(
    `
      update project_invitations
      set status = 'accepted',
          updated_at = now()
      where lower(email) = lower($1)
        and status = 'pending'
      returning id, project_id, email, role, invited_by_user_id, status
    `,
    [input.email],
  );

  return result.rows;
}
