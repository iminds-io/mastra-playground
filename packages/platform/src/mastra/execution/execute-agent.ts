import { loadProjectContext } from '../../services/project-context';
import { resolveWorkspaceForProject } from '../../workspace/resolver';

export async function executeProjectAgent(input: {
  firebaseUid: string;
  projectId: string;
  message: string;
}) {
  const projectContext = await loadProjectContext({
    firebaseUid: input.firebaseUid,
    projectId: input.projectId,
  });
  const resolvedWorkspace = await resolveWorkspaceForProject(input.projectId);

  return {
    resourceId: projectContext.resourceId,
    workspaceRootPath: resolvedWorkspace.root.root_path,
    binding: resolvedWorkspace.binding,
    message: input.message,
  };
}
