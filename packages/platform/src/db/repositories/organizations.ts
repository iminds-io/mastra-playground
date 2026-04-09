import { pool } from '../client';

export type OrganizationRecord = {
  id: string;
  name: string;
  firebase_project_id: string;
};

export async function createOrganization(input: {
  name: string;
  firebaseProjectId: string;
}): Promise<OrganizationRecord> {
  const result = await pool.query<OrganizationRecord>(
    `
      insert into organizations(name, firebase_project_id)
      values($1, $2)
      returning id, name, firebase_project_id
    `,
    [input.name, input.firebaseProjectId],
  );

  return result.rows[0]!;
}
