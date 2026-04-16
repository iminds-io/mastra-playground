import { getDatabasePool } from '../context';

export type WorkspaceBindingRecord = {
  id: string;
  project_id: string;
  workspace_root_id: string;
  editor_workspace_ref: string | null;
  active_agent_ref: string;
  active_agent_version: string;
  policy_json: Record<string, unknown>;
};

export async function createWorkspaceBinding(input: {
  projectId: string;
  workspaceRootId: string;
  activeAgentRef: string;
  activeAgentVersion: string;
  policyJson: Record<string, unknown>;
}): Promise<WorkspaceBindingRecord> {
  const result = await getDatabasePool().query<WorkspaceBindingRecord>(
    `
      insert into workspace_bindings(
        project_id,
        workspace_root_id,
        active_agent_ref,
        active_agent_version,
        policy_json
      )
      values($1, $2, $3, $4, $5::jsonb)
      returning
        id,
        project_id,
        workspace_root_id,
        editor_workspace_ref,
        active_agent_ref,
        active_agent_version,
        policy_json
    `,
    [input.projectId, input.workspaceRootId, input.activeAgentRef, input.activeAgentVersion, JSON.stringify(input.policyJson)],
  );

  return result.rows[0]!;
}

export async function getActiveWorkspaceBinding(projectId: string): Promise<WorkspaceBindingRecord | null> {
  const result = await getDatabasePool().query<WorkspaceBindingRecord>(
    `
      select
        id,
        project_id,
        workspace_root_id,
        editor_workspace_ref,
        active_agent_ref,
        active_agent_version,
        policy_json
      from workspace_bindings
      where project_id = $1
        and archived_at is null
      limit 1
    `,
    [projectId],
  );

  return result.rows[0] ?? null;
}
