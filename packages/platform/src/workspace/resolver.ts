import { getActiveWorkspaceBinding } from '../db/repositories/workspace-bindings';
import { getActiveWorkspaceRootByProjectId } from '../db/repositories/workspace-roots';
import { createRuntimeWorkspace } from './factory';

export async function resolveWorkspaceForProject(projectId: string) {
  const [root, binding] = await Promise.all([
    getActiveWorkspaceRootByProjectId(projectId),
    getActiveWorkspaceBinding(projectId),
  ]);

  if (!root || !binding) {
    throw new Error('Workspace is not provisioned for this project');
  }

  const workspace = await createRuntimeWorkspace(root.root_path);

  return {
    root,
    binding,
    workspace,
  };
}
