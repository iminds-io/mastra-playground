import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  getIntegrationEnvFilePath,
  loadIntegrationDatabaseEnvFile,
  writeIntegrationDatabaseEnvFile,
} from '../helpers/integration-env-file';

const tempDirs: string[] = [];

async function makeTempRoot() {
  const dir = await mkdtemp(join(tmpdir(), 'mindspace-integration-env-'));
  tempDirs.push(dir);
  return dir;
}

describe('integration env file helper', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(async () => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('loads the integration branch database URL over the root env database URL', async () => {
    const rootDir = await makeTempRoot();
    const deploymentUrl = 'postgresql://owner:secret@example.invalid/deployment?sslmode=require';
    const branchUrl = 'postgresql://owner:secret@example.invalid/neondb?sslmode=require';

    await writeFile(join(rootDir, '.env'), `DATABASE_URL=${deploymentUrl}\n`);
    await writeIntegrationDatabaseEnvFile(rootDir, branchUrl);

    loadIntegrationDatabaseEnvFile(rootDir);

    expect(process.env.DATABASE_URL).toBe(branchUrl);
  });

  it('writes the branch database URL to the agreed integration env file', async () => {
    const rootDir = await makeTempRoot();
    const branchUrl = 'postgresql://owner:secret@example.invalid/neondb?sslmode=require';

    const filePath = await writeIntegrationDatabaseEnvFile(rootDir, branchUrl);

    expect(filePath).toBe(getIntegrationEnvFilePath(rootDir));
  });
});
