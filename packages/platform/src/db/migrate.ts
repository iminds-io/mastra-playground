import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseEnv } from '../env';
import { pool } from './client';
import { config } from 'dotenv';
import { Pool } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, 'migrations');
config({ path: resolve(__dirname, '../../../../.env') });
const env = parseEnv(process.env);

async function ensureDatabaseExists() {
  const databaseUrl = new URL(env.databaseUrl);
  const databaseName = databaseUrl.pathname.replace(/^\//, '');

  if (!databaseName) {
    throw new Error('DATABASE_URL must include a database name');
  }

  const adminUrl = new URL(env.databaseUrl);
  adminUrl.pathname = '/postgres';

  const adminPool = new Pool({
    connectionString: adminUrl.toString(),
  });

  try {
    const result = await adminPool.query<{ exists: boolean }>(
      `select exists(select 1 from pg_database where datname = $1) as exists`,
      [databaseName],
    );

    if (!result.rows[0]?.exists) {
      await adminPool.query(`create database "${databaseName}"`);
    }
  } finally {
    await adminPool.end();
  }
}

async function ensureMigrationsTable() {
  await pool.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function getAppliedVersions() {
  const result = await pool.query<{ version: string }>(
    'select version from schema_migrations order by version asc',
  );

  return new Set(result.rows.map((row: { version: string }) => row.version));
}

export async function migrate() {
  await ensureDatabaseExists();
  await ensureMigrationsTable();

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const applied = await getAppliedVersions();

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const sql = await readFile(resolve(migrationsDir, file), 'utf8');

    await pool.query('begin');

    try {
      await pool.query(sql);
      await pool.query('insert into schema_migrations(version) values($1)', [file]);
      await pool.query('commit');
    } catch (error) {
      await pool.query('rollback');
      throw error;
    }
  }
}

const isDirectExecution = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isDirectExecution) {
  migrate()
    .then(async () => {
      await pool.end();
    })
    .catch(async (error) => {
      console.error(error);
      await pool.end();
      process.exitCode = 1;
    });
}
