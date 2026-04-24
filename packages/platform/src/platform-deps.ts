// ABOUTME: Ambient runtime dependencies threaded through every principal-flow service.
// ABOUTME: Constructed once per request at the entry point and passed down explicitly.

import type { Mastra } from '@mastra/core';
import type { Workspace } from '@mastra/core/workspace';

export type MindspaceFactory = (basePath: string) => Promise<Workspace>;

export type PlatformDeps = {
  mastra: Mastra;
  mindspaceFactory: MindspaceFactory;
};
