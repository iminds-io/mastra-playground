// ABOUTME: Spawns `wrangler dev` on a free port with a test .dev.vars file, and returns
// ABOUTME: a base URL plus cleanup handle. Used by E2E tests to drive the real worker runtime.

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { findAvailablePort, waitForServer } from './live-smoke-utils';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_ROOT = resolve(__dirname, '../..');
const HOST = '127.0.0.1';

function renderEnvContent(values: Record<string, string | undefined>): string {
  return Object.entries(values)
    .filter((entry): entry is [string, string] =>
      typeof entry[1] === 'string' && entry[1].length > 0,
    )
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('\n') + '\n';
}

function terminateProcessTree(child: ChildProcess | undefined): void {
  if (!child || child.killed) return;
  if (process.platform === 'win32') {
    child.kill('SIGTERM');
    return;
  }
  try {
    process.kill(-child.pid!, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

export type SpawnedWorker = {
  baseUrl: string;
  cleanup(): Promise<void>;
};

export async function spawnWorker(options: {
  envOverrides: Record<string, string | undefined>;
  devVarsPath?: string;
}): Promise<SpawnedWorker> {
  const port = String(await findAvailablePort(HOST));
  const inspectorPort = String(await findAvailablePort(HOST));
  const devVarsPath = options.devVarsPath ?? resolve(WORKER_ROOT, '.dev.vars.test');
  writeFileSync(devVarsPath, renderEnvContent(options.envOverrides));

  const child = spawn(
    'pnpm',
    [
      'exec',
      'wrangler',
      'dev',
      '--ip', HOST,
      '--port', port,
      '--inspector-port', inspectorPort,
      '--var-file', devVarsPath,
    ],
    {
      cwd: WORKER_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    },
  );

  child.stdout?.on('data', (chunk) => process.stdout.write(`[worker] ${chunk}`));
  child.stderr?.on('data', (chunk) => process.stderr.write(`[worker] ${chunk}`));

  const baseUrl = `http://${HOST}:${port}`;
  try {
    await waitForServer({ baseUrl, healthPath: '/health', child, timeoutMs: 90_000 });
  } catch (err) {
    terminateProcessTree(child);
    if (existsSync(devVarsPath)) rmSync(devVarsPath);
    throw err;
  }

  return {
    baseUrl,
    async cleanup() {
      terminateProcessTree(child);
      await delay(300);
      if (existsSync(devVarsPath)) rmSync(devVarsPath);
    },
  };
}
