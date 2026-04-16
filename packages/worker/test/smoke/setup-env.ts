// ABOUTME: Vitest setupFiles entry that loads the repo root .env for every smoke test worker.
// ABOUTME: Without this, SMOKE_BASE_URL and other env vars are unavailable during test init.

import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../../.env') });
