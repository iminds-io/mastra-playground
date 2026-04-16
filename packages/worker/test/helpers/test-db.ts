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

function createNeonApiClient(): NeonApiClient {
  const apiKey = getEnvOrThrow('NEON_API_KEY');
  const projectId = getEnvOrThrow('NEON_PROJECT_ID');
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
        connection_uris?: Array<{ connection_uri: string }>;
      };
      const connectionUri = body.connection_uris?.[0]?.connection_uri;
      if (!connectionUri) {
        throw new Error('Neon createBranch: no connection_uri returned');
      }
      return { branchId: body.branch.id, connectionString: connectionUri };
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
            await sql(stmt);
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
          workspace_provisioning_jobs,
          workspace_events,
          workspace_locks,
          workspace_bindings,
          workspace_roots,
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
