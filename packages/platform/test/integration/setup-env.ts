// ABOUTME: Vitest setupFiles entry that loads the repo root .env and then the
// ABOUTME: integration branch DATABASE_URL written by globalSetup.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadIntegrationDatabaseEnvFile } from '../helpers/integration-env-file';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadIntegrationDatabaseEnvFile(resolve(__dirname, '../../../../'));
