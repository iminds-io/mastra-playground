import { Mastra } from '@mastra/core';

import { createProjectAgent } from './agents/project-agent';
import type { ProjectAgentConfig } from './agents/project-agent';
import { createMastraStorage } from './storage';

export function createMastra(connectionString: string, agentConfig?: ProjectAgentConfig) {
  return new Mastra({
    agents: {
      projectAgent: createProjectAgent(agentConfig),
    },
    storage: createMastraStorage(connectionString),
  });
}
