// ABOUTME: Module-level database pool holder, allowing the pool implementation
// ABOUTME: to be injected at startup (pg for Node.js, neon-serverless for CF Workers).

export type QueryResult<T> = {
  rows: T[];
  rowCount: number | null;
};

export type DatabasePool = {
  query<T = any>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
};

let currentPool: DatabasePool | undefined;

export function setDatabasePool(pool: DatabasePool): void {
  currentPool = pool;
}

export function getDatabasePool(): DatabasePool {
  if (!currentPool) {
    throw new Error('Database pool has not been initialized');
  }
  return currentPool;
}
