import { getDatabasePool } from '../context';

export type OrganizationRecord = {
  id: string;
  name: string;
  firebase_project_id: string;
};

export async function createOrganization(input: {
  name: string;
  firebaseProjectId: string;
}): Promise<OrganizationRecord> {
  const result = await getDatabasePool().query<OrganizationRecord>(
    `
      insert into organizations(name, firebase_project_id)
      values($1, $2)
      returning id, name, firebase_project_id
    `,
    [input.name, input.firebaseProjectId],
  );

  return result.rows[0]!;
}

export async function getOrganizationByFirebaseProjectId(
  firebaseProjectId: string,
): Promise<OrganizationRecord | null> {
  const result = await getDatabasePool().query<OrganizationRecord>(
    `
      select id, name, firebase_project_id
      from organizations
      where firebase_project_id = $1
      limit 1
    `,
    [firebaseProjectId],
  );

  return result.rows[0] ?? null;
}
