// ABOUTME: Module-level workspace factory holder, allowing the workspace implementation
// ABOUTME: to be injected at startup (LocalFilesystem for Node.js, S3Filesystem for CF Workers).

import type { Workspace } from '@mastra/core/workspace';

export type WorkspaceFactory = (basePath: string) => Promise<Workspace>;

let currentFactory: WorkspaceFactory | undefined;

export function setWorkspaceFactory(factory: WorkspaceFactory): void {
  currentFactory = factory;
}

export function getWorkspaceFactory(): WorkspaceFactory {
  if (!currentFactory) {
    throw new Error('Workspace factory has not been initialized');
  }
  return currentFactory;
}
