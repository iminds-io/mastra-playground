import { Mastra } from '@mastra/core';

import { createMastraStorage } from './storage';

export function createMastra(connectionString: string) {
  return new Mastra({
    storage: createMastraStorage(connectionString),
  });
}
