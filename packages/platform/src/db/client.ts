import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

import { parseEnv } from '../env';

const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(__dirname, '../../../../.env') });

const env = parseEnv(process.env);

export const pool = new Pool({
  connectionString: env.databaseUrl,
});
