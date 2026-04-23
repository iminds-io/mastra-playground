import { getActiveWorkspaceBinding } from '../db/repositories/workspace-bindings';
import { getActiveWorkspaceRootByProjectId } from '../db/repositories/workspace-roots';
import type { WorkspaceFactory } from '../platform-deps';

function requireWorkspaceFactory(value: unknown): asserts value is WorkspaceFactory {
  if (typeof value !== 'function') {
    throw new Error('resolveWorkspaceForProject: workspaceFactory is required.');
  }
}

export async function resolveWorkspaceForProject(
  projectId: string,
  deps: { workspaceFactory: WorkspaceFactory },
) {
  requireWorkspaceFactory(deps?.workspaceFactory);

  const [root, binding] = await Promise.all([
    getActiveWorkspaceRootByProjectId(projectId),
    getActiveWorkspaceBinding(projectId),
  ]);

  if (!root || !binding) {
    throw new Error('Workspace is not provisioned for this project');
  }

  const workspace = await deps.workspaceFactory(root.root_path);

  return {
    root,
    binding,
    workspace,
  };
}
