import { getDatabasePool } from '../context';

export type WorkspaceRootRecord = {
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

export async function createWorkspaceRoot(input: {
  organizationId: string;
  projectId: string;
  rootPath: string;
  status: string;
}): Promise<WorkspaceRootRecord> {
  const result = await getDatabasePool().query<WorkspaceRootRecord>(
    `
      insert into workspace_roots(
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

export async function markWorkspaceRootReady(id: string): Promise<WorkspaceRootRecord> {
  return updateWorkspaceRootStatus(id, 'ready');
}

export async function getActiveWorkspaceRootByProjectId(projectId: string): Promise<WorkspaceRootRecord | null> {
  const result = await getDatabasePool().query<WorkspaceRootRecord>(
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
      from workspace_roots
      where project_id = $1
        and archived_at is null
      limit 1
    `,
    [projectId],
  );

  return result.rows[0] ?? null;
}

export async function updateWorkspaceRootStatus(id: string, status: string): Promise<WorkspaceRootRecord> {
  const result = await getDatabasePool().query<WorkspaceRootRecord>(
    `
      update workspace_roots
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
