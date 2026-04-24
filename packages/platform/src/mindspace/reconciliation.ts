import { getActiveMindspaceRootByProjectId, updateMindspaceRootStatus } from '../db/repositories/mindspace-roots';
import type { MindspaceFactory } from '../platform-deps';
import { recordMindspaceEvent } from '../services/audit';

export async function reconcileMindspaceForProject(
  projectId: string,
  deps: { mindspaceFactory: MindspaceFactory },
) {
  const root = await getActiveMindspaceRootByProjectId(projectId);

  if (!root) {
    throw new Error('Mindspace root not found for project');
  }

  try {
    const workspace = await deps.mindspaceFactory(root.root_path);
    if (!workspace.filesystem) {
      throw new Error('Workspace filesystem is not configured');
    }
    await workspace.filesystem.exists('/');

    return root;
  } catch {
    const updatedRoot = await updateMindspaceRootStatus(root.id, 'error');

    await recordMindspaceEvent({
      mindspaceRootId: root.id,
      eventType: 'mindspace.missing_directory',
      payloadJson: {
        projectId,
        rootPath: root.root_path,
      },
    });

    return updatedRoot;
  }
}
