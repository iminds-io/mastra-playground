import { Mastra } from '@mastra/core';
import { MastraEditor } from '@mastra/editor';

import type { ProjectAgentConfig } from './agents/project-agent';
import { createAgentRegistry } from './agents/registry';
import { createMastraStorage } from './storage';
import { createWorkflowRegistry } from './workflows/registry';

export function createMastra(connectionString: string, agentConfig?: ProjectAgentConfig) {
  const workflows = createWorkflowRegistry();
  const agents = createAgentRegistry(agentConfig, { workflows });

  return new Mastra({
    agents,
    workflows,
    storage: createMastraStorage(connectionString),
    // MastraEditor mounts /api/mastra/stored/* endpoints on MastraServer so operators
    // can edit agent instructions and tools at runtime. Stored agents are versioned;
    // routes targeting a specific version are enabled by the worker's /api/mastra
    // mount (see packages/worker/src/index.ts and the Phase 5 version-targeting work).
    editor: new MastraEditor(),
  });
}
