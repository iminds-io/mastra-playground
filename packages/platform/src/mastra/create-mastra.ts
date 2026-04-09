import { Mastra } from '@mastra/core';

import { createProjectAgent } from './agents/project-agent';
import { createMastraStorage } from './storage';

export function createMastra(connectionString: string) {
  return new Mastra({
    agents: {
      projectAgent: createProjectAgent(),
    },
    storage: createMastraStorage(connectionString),
  });
}
