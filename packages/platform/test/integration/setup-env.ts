// ABOUTME: Vitest setupFiles entry that loads the repo root .env in every test worker.
// ABOUTME: globalSetup doesn't propagate env vars to workers — they need their own load.

import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../../.env') });
