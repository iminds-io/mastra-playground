import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace';

import { setWorkspaceFactory } from './workspace-context';

export async function createRuntimeWorkspace(basePath: string) {
  const workspace = new Workspace({
    filesystem: new LocalFilesystem({
      basePath,
      contained: true,
    }),
    sandbox: new LocalSandbox({
      workingDirectory: basePath,
      env: {
        PATH: process.env.PATH ?? '',
      },
    }),
  });

  await workspace.init();

  return workspace;
}

setWorkspaceFactory(createRuntimeWorkspace);
