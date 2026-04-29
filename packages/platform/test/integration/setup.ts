// ABOUTME: Vitest globalSetup for platform integration tests.
// ABOUTME: Creates a Neon branch, runs migrations, exports DATABASE_URL. Deletes branch on teardown.

import { unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { createTestBranch, type TestBranch } from '../../../worker/test/helpers/test-db';
import {
  getIntegrationEnvFilePath,
  writeIntegrationDatabaseEnvFile,
} from '../helpers/integration-env-file';
import { initMastraSchema } from '../../src/mastra/storage';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../../../../');

// Load repo root .env so createTestBranch can read Neon credentials.
config({ path: resolve(rootDir, '.env') });

let branch: TestBranch | undefined;

export default async function globalSetup() {
  branch = await createTestBranch({ prefix: 'integration' });
  await branch.runMigrations();
  await initMastraSchema(branch.connectionString);
  process.env.DATABASE_URL = branch.connectionString;
  await writeIntegrationDatabaseEnvFile(rootDir, branch.connectionString);
  // eslint-disable-next-line no-console
  console.log(`[integration] created Neon branch ${branch.branchId} with Mastra schema`);

  return async function teardown() {
    if (!branch) return;
    try {
      await unlink(getIntegrationEnvFilePath(rootDir)).catch(() => {
        /* best effort */
      });
      await branch.deleteBranch();
      // eslint-disable-next-line no-console
      console.log(`[integration] deleted Neon branch ${branch.branchId}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[integration] failed to delete branch:', err);
      throw err;
    }
  };
}
