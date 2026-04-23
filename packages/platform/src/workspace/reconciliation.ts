import { getActiveWorkspaceRootByProjectId, updateWorkspaceRootStatus } from '../db/repositories/workspace-roots';
import type { WorkspaceFactory } from '../platform-deps';
import { recordWorkspaceEvent } from '../services/audit';

export async function reconcileWorkspaceForProject(
  projectId: string,
  deps: { workspaceFactory: WorkspaceFactory },
) {
  const root = await getActiveWorkspaceRootByProjectId(projectId);

  if (!root) {
    throw new Error('Workspace root not found for project');
  }

  try {
    const workspace = await deps.workspaceFactory(root.root_path);
    if (!workspace.filesystem) {
      throw new Error('Workspace filesystem is not configured');
    }
    await workspace.filesystem.exists('/');

    return root;
  } catch {
    const updatedRoot = await updateWorkspaceRootStatus(root.id, 'error');

    await recordWorkspaceEvent({
      workspaceRootId: root.id,
      eventType: 'workspace.missing_directory',
      payloadJson: {
        projectId,
        rootPath: root.root_path,
      },
    });

    return updatedRoot;
  }
}
