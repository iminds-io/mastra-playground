import { getDatabasePool } from '../context';

export type OrganizationMembershipRecord = {
  id: string;
  organization_id: string;
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
