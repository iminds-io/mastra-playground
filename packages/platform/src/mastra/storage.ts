// ABOUTME: Mastra PostgresStore with a per-request Neon-serverless Pool.
// ABOUTME: Works on Cloudflare Workers with Memory's async buffering disabled + schema pre-initialized.

import { PostgresStore } from '@mastra/pg';
import { Pool } from '@neondatabase/serverless';

// Design notes:
// - We use @neondatabase/serverless's Pool (which extends pg.Pool) rather than the
//   native pg.Pool, because pg's CF Workers transport (pg-cloudflare) creates a
//   `CloudflareSocket` that cannot cross request boundaries.
// - We do NOT set `poolQueryViaFetch = true`. HTTP mode can't execute multi-
//   statement DDL that Mastra emits during init (error 42601).
// - Mastra Memory's observational async buffering is disabled (see project-agent.ts).
//   Without that, all storage work stays in-request, so WebSocket-based transactions
//   complete before the CF request ends.
// - `disableInit: true` is REQUIRED on CF Workers. Concurrent requests each create
//   a new PostgresStore, each runs init() DDL, and two concurrent `ALTER TABLE`s
//   race to a deadlock (error 40P01). Instead, init Mastra's schema once
//   out-of-band via initMastraSchema() below and keep disableInit on at runtime.

export function createMastraStorage(
  connectionString: string,
  options: { disableInit?: boolean } = {},
) {
  const pool = new Pool({ connectionString });
  return new PostgresStore({
    id: 'mastra-storage',
    pool,
    disableInit: options.disableInit ?? true,
  });
}

/**
 * Run Mastra's DDL once to provision `mastra_*` tables on the given connection.
 * Call this from test orchestrators or deploy scripts — never from an
 * individual request handler (concurrent inits deadlock).
 */
export async function initMastraSchema(connectionString: string): Promise<void> {
  const store = createMastraStorage(connectionString, { disableInit: false });
  await store.init();
  await store.close();
}
