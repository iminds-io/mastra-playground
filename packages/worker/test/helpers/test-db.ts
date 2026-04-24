// ABOUTME: Neon branch lifecycle for tests — create, migrate, truncate, delete.
// ABOUTME: Uses the Neon REST API and runs platform migrations against each branch.

import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../../../platform/src/db/migrations');

type NeonBranch = {
  branchId: string;
  connectionString: string;
};

type NeonApiClient = {
  createBranch(name: string): Promise<NeonBranch>;
  deleteBranch(branchId: string): Promise<void>;
};

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

export function rewriteDatabaseUrlHost(databaseUrl: string, newHost: string): string {
  const parsed = new URL(databaseUrl);
  parsed.hostname = newHost;
  return parsed.toString();
}

export function rewriteDatabaseUrlHostAndDatabase(
  databaseUrl: string,
  newHost: string,
  newDatabase: string,
): string {
  const parsed = new URL(databaseUrl);
  parsed.hostname = newHost;
  parsed.pathname = `/${newDatabase}`;
  return parsed.toString();
}

export function createTestBranchName(prefix: string): string {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10);
  const ts = now.getTime();
  const rand = Math.random().toString(36).slice(2, 8);
  return `test-${prefix}-${ymd}-${ts}-${rand}`;
}

export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;
    else if (c === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;

    if (c === ';' && !inSingleQuote && !inDoubleQuote) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
    } else {
      current += c;
    }
  }
  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

type NeonEndpoint = {
  host: string;
  hosts?: {
    read_write_host?: string;
    read_write_pooled_host?: string;
  };
  type: string;
};

function createNeonApiClient(): NeonApiClient {
  const apiKey = getEnvOrThrow('NEON_API_KEY');
  const projectId = getEnvOrThrow('NEON_PROJECT_ID');
  const parentDatabaseUrl = getEnvOrThrow('DATABASE_URL');
  const baseUrl = 'https://console.neon.tech/api/v2';
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  return {
    async createBranch(name: string): Promise<NeonBranch> {
      const response = await fetch(`${baseUrl}/projects/${projectId}/branches`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          branch: { name },
          endpoints: [{ type: 'read_write' }],
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Neon createBranch failed: ${response.status} ${text}`);
      }
      const body = await response.json() as {
        branch: { id: string };
        endpoints: NeonEndpoint[];
      };
      const endpoint = body.endpoints[0];
      if (!endpoint) {
        throw new Error('Neon createBranch: no endpoints returned');
      }
      const host = endpoint.hosts?.read_write_pooled_host ?? endpoint.host;
      // Target the default `neondb` database owned by neondb_owner (the user in
      // DATABASE_URL). The parent's custom database may be owned by a different
      // role, causing permission errors on DDL.
      const connectionString = rewriteDatabaseUrlHostAndDatabase(parentDatabaseUrl, host, 'neondb');
      return { branchId: body.branch.id, connectionString };
    },

    async deleteBranch(branchId: string): Promise<void> {
      const response = await fetch(
        `${baseUrl}/projects/${projectId}/branches/${branchId}`,
        { method: 'DELETE', headers },
      );
      if (!response.ok && response.status !== 404) {
        const text = await response.text();
        throw new Error(`Neon deleteBranch failed: ${response.status} ${text}`);
      }
    },
  };
}

async function readMigrationSqlFiles(): Promise<Array<{ name: string; sql: string }>> {
  const entries = await readdir(MIGRATIONS_DIR);
  const sqlFiles = entries.filter((e) => e.endsWith('.sql')).sort();
  return Promise.all(
    sqlFiles.map(async (name) => ({
      name,
      sql: await readFile(resolve(MIGRATIONS_DIR, name), 'utf8'),
    })),
  );
}

export type TestBranch = {
  branchId: string;
  connectionString: string;
  runMigrations(): Promise<void>;
  truncateAllTables(): Promise<void>;
  deleteBranch(): Promise<void>;
};

export async function createTestBranch(options: { prefix: string }): Promise<TestBranch> {
  const client = createNeonApiClient();
  const { neon } = await import('@neondatabase/serverless');
  const name = createTestBranchName(options.prefix);
  const { branchId, connectionString } = await client.createBranch(name);
  const sql = neon(connectionString);

  return {
    branchId,
    connectionString,
    async runMigrations() {
      const files = await readMigrationSqlFiles();
      for (const file of files) {
        const statements = splitSqlStatements(file.sql);
        for (const stmt of statements) {
          try {
            await sql.query(stmt);
          } catch (err) {
            throw new Error(`Migration ${file.name} failed on statement:\n${stmt}\n\n${err}`);
          }
        }
      }
    },
    async truncateAllTables() {
      await sql`
        truncate table
          channel_threads,
          project_channels,
          mindspace_provisioning_jobs,
          mindspace_events,
          mindspace_locks,
          mindspace_bindings,
          mindspace_roots,
          organization_memberships,
          projects,
          users,
          organizations
        cascade
      `;
    },
    async deleteBranch() {
      await client.deleteBranch(branchId);
    },
  };
}
