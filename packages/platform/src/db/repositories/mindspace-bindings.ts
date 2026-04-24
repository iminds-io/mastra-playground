import { getDatabasePool } from '../context';

export type MindspaceBindingRecord = {
  id: string;
  project_id: string;
  mindspace_root_id: string;
  editor_mindspace_ref: string | null;
  active_agent_ref: string;
  active_agent_version: string;
  policy_json: Record<string, unknown>;
};

export async function createMindspaceBinding(input: {
  projectId: string;
  mindspaceRootId: string;
  activeAgentRef: string;
  activeAgentVersion: string;
  policyJson: Record<string, unknown>;
}): Promise<MindspaceBindingRecord> {
  const result = await getDatabasePool().query<MindspaceBindingRecord>(
    `
      insert into mindspace_bindings(
        project_id,
        mindspace_root_id,
        active_agent_ref,
        active_agent_version,
        policy_json
      )
      values($1, $2, $3, $4, $5::jsonb)
      returning
        id,
        project_id,
        mindspace_root_id,
        editor_mindspace_ref,
        active_agent_ref,
        active_agent_version,
        policy_json
    `,
    [input.projectId, input.mindspaceRootId, input.activeAgentRef, input.activeAgentVersion, JSON.stringify(input.policyJson)],
  );

  return result.rows[0]!;
}

export async function getActiveMindspaceBinding(projectId: string): Promise<MindspaceBindingRecord | null> {
  const result = await getDatabasePool().query<MindspaceBindingRecord>(
    `
      select
        id,
        project_id,
        mindspace_root_id,
        editor_mindspace_ref,
        active_agent_ref,
        active_agent_version,
        policy_json
      from mindspace_bindings
      where project_id = $1
        and archived_at is null
      limit 1
    `,
    [projectId],
  );

  return result.rows[0] ?? null;
}
