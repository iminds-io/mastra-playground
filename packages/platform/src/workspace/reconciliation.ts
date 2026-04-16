import { getActiveWorkspaceRootByProjectId, updateWorkspaceRootStatus } from '../db/repositories/workspace-roots';
import { recordWorkspaceEvent } from '../services/audit';
import { getWorkspaceFactory } from './workspace-context';

export async function reconcileWorkspaceForProject(projectId: string) {
  const root = await getActiveWorkspaceRootByProjectId(projectId);

  if (!root) {
    throw new Error('Workspace root not found for project');
  }

  try {
    const factory = getWorkspaceFactory();
    const workspace = await factory(root.root_path);
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
