import { getActiveMindspaceBinding } from '../db/repositories/mindspace-bindings';
import { getActiveMindspaceRootByProjectId } from '../db/repositories/mindspace-roots';
import type { MindspaceFactory } from '../platform-deps';

function requireMindspaceFactory(value: unknown): asserts value is MindspaceFactory {
  if (typeof value !== 'function') {
    throw new Error('resolveMindspaceForProject: mindspaceFactory is required.');
  }
}

export async function resolveMindspaceForProject(
  projectId: string,
  deps: { mindspaceFactory: MindspaceFactory },
) {
  requireMindspaceFactory(deps?.mindspaceFactory);

  const [root, binding] = await Promise.all([
    getActiveMindspaceRootByProjectId(projectId),
    getActiveMindspaceBinding(projectId),
  ]);

  if (!root || !binding) {
    throw new Error('Workspace is not provisioned for this project');
  }

  const workspace = await deps.mindspaceFactory(root.root_path);

  return {
    root,
    binding,
    workspace,
  };
}
