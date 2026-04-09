import { PostgresStore } from '@mastra/pg';

export function createMastraStorage(connectionString: string) {
  return new PostgresStore({
    id: 'mastra-storage',
    connectionString,
  });
}
