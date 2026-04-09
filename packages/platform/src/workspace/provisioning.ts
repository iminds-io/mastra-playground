import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseEnv } from '../env';
import { createWorkspaceBinding, getActiveWorkspaceBinding } from '../db/repositories/workspace-bindings';
import { createWorkspaceRoot, getActiveWorkspaceRootByProjectId, markWorkspaceRootReady } from '../db/repositories/workspace-roots';
import { config } from 'dotenv';
import { buildWorkspaceRootPath, ensureContainedWorkspacePath } from './paths';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../../.env') });

const env = parseEnv(process.env);
const DEFAULT_DIRECTORIES = ['repo', 'docs', 'output', 'tmp', '.workspace-meta'] as const;

export async function provisionWorkspaceForProject(input: {
  organizationId: string;
  projectId: string;
  requestedBy: string;
  activeAgentRef: string;
  activeAgentVersion: string;
}) {
  const existingRoot = await getActiveWorkspaceRootByProjectId(input.projectId);
  const existingBinding = await getActiveWorkspaceBinding(input.projectId);

  if (existingRoot && existingBinding) {
    return {
      root: existingRoot,
      binding: existingBinding,
      directories: [...DEFAULT_DIRECTORIES],
    };
  }

  const rootPath = ensureContainedWorkspacePath(
    env.workspaceRoot,
    buildWorkspaceRootPath(env.workspaceRoot, input.organizationId, input.projectId),
  );

  await mkdir(rootPath, { recursive: true });

  for (const directory of DEFAULT_DIRECTORIES) {
    await mkdir(resolve(rootPath, directory), { recursive: true });
  }

  const provisionalRoot =
    existingRoot ??
    (await createWorkspaceRoot({
      organizationId: input.organizationId,
      projectId: input.projectId,
      rootPath,
      status: 'provisioning',
    }));

  const root = await markWorkspaceRootReady(provisionalRoot.id);

  const binding =
    existingBinding ??
    (await createWorkspaceBinding({
      projectId: input.projectId,
      workspaceRootId: root.id,
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
