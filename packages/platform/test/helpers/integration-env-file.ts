import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { config } from 'dotenv';

const INTEGRATION_ENV_FILENAME = '.vitest.integration.env';

export function getIntegrationEnvFilePath(rootDir: string): string {
  return join(rootDir, INTEGRATION_ENV_FILENAME);
}

export async function writeIntegrationDatabaseEnvFile(
  rootDir: string,
  databaseUrl: string,
): Promise<string> {
  const filePath = getIntegrationEnvFilePath(rootDir);
  await writeFile(filePath, `DATABASE_URL=${JSON.stringify(databaseUrl)}\n`);
  return filePath;
}

export function loadIntegrationDatabaseEnvFile(rootDir: string): void {
  config({ path: join(rootDir, '.env') });
  config({ path: getIntegrationEnvFilePath(rootDir), override: true });
}
