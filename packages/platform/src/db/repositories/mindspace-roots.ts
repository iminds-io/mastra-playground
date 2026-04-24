import { getDatabasePool } from '../context';

export type MindspaceRootRecord = {
  id: string;
  organization_id: string;
  project_id: string;
  storage_type: string;
  root_path: string;
  status: string;
  filesystem_provider_type: string;
  sandbox_provider_type: string;
  is_read_only: boolean;
};

export async function createMindspaceRoot(input: {
  organizationId: string;
  projectId: string;
  rootPath: string;
  status: string;
}): Promise<MindspaceRootRecord> {
  const result = await getDatabasePool().query<MindspaceRootRecord>(
    `
      insert into mindspace_roots(
        organization_id,
        project_id,
        storage_type,
        root_path,
        status,
        filesystem_provider_type,
        sandbox_provider_type
      )
      values($1, $2, 'local_fs', $3, $4, 'local_filesystem', 'local_sandbox')
      returning
        id,
        organization_id,
        project_id,
        storage_type,
        root_path,
        status,
        filesystem_provider_type,
        sandbox_provider_type,
        is_read_only
    `,
    [input.organizationId, input.projectId, input.rootPath, input.status],
  );

  return result.rows[0]!;
}

export async function markMindspaceRootReady(id: string): Promise<MindspaceRootRecord> {
  return updateMindspaceRootStatus(id, 'ready');
}

export async function getActiveMindspaceRootByProjectId(projectId: string): Promise<MindspaceRootRecord | null> {
  const result = await getDatabasePool().query<MindspaceRootRecord>(
    `
      select
        id,
        organization_id,
        project_id,
        storage_type,
        root_path,
        status,
        filesystem_provider_type,
        sandbox_provider_type,
        is_read_only
      from mindspace_roots
      where project_id = $1
        and archived_at is null
      limit 1
    `,
    [projectId],
  );

  return result.rows[0] ?? null;
}

export async function updateMindspaceRootStatus(id: string, status: string): Promise<MindspaceRootRecord> {
  const result = await getDatabasePool().query<MindspaceRootRecord>(
    `
      update mindspace_roots
      set status = $2, updated_at = now()
      where id = $1
      returning
        id,
        organization_id,
        project_id,
        storage_type,
        root_path,
        status,
        filesystem_provider_type,
        sandbox_provider_type,
        is_read_only
    `,
    [id, status],
  );

  return result.rows[0]!;
}
