import { createMindspaceBinding, getActiveMindspaceBinding } from '../db/repositories/mindspace-bindings';
import { createMindspaceRoot, getActiveMindspaceRootByProjectId, markMindspaceRootReady } from '../db/repositories/mindspace-roots';
import { buildMindspaceRootPath, ensureContainedMindspacePath } from './paths';

const DEFAULT_DIRECTORIES = ['repo', 'docs', 'output', 'tmp', '.mindspace-meta'] as const;

export async function provisionMindspaceForProject(input: {
  organizationId: string;
  projectId: string;
  requestedBy: string;
  activeAgentRef: string;
  activeAgentVersion: string;
  mindspaceRoot: string;
}) {
  const existingRoot = await getActiveMindspaceRootByProjectId(input.projectId);
  const existingBinding = await getActiveMindspaceBinding(input.projectId);

  if (existingRoot && existingBinding) {
    return {
      root: existingRoot,
      binding: existingBinding,
      directories: [...DEFAULT_DIRECTORIES],
    };
  }

  const rootPath = ensureContainedMindspacePath(
    input.mindspaceRoot,
    buildMindspaceRootPath(input.mindspaceRoot, input.organizationId, input.projectId),
  );

  const provisionalRoot =
    existingRoot ??
    (await createMindspaceRoot({
      organizationId: input.organizationId,
      projectId: input.projectId,
      rootPath,
      status: 'provisioning',
    }));

  const root = await markMindspaceRootReady(provisionalRoot.id);

  const binding =
    existingBinding ??
    (await createMindspaceBinding({
      projectId: input.projectId,
      mindspaceRootId: root.id,
      activeAgentRef: input.activeAgentRef,
      activeAgentVersion: input.activeAgentVersion,
      policyJson: {
        allowCommandExecution: true,
        allowDeletes: false,
      },
    }));

  return {
    root,
    binding,
    directories: [...DEFAULT_DIRECTORIES],
  };
}
