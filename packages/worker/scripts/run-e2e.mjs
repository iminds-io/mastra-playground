#!/usr/bin/env node
// ABOUTME: E2E test orchestrator — provisions infrastructure, spawns wrangler dev,
// ABOUTME: runs vitest, then cleans up Neon branch + R2 prefix + spawned processes.

import { spawn } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';

import { findAvailablePort, waitForServer } from '../test/helpers/live-smoke-utils.ts';
import { createTestBranch } from '../test/helpers/test-db.ts';
import { cleanupPrefix } from '../test/helpers/test-r2.ts';

const HOST = '127.0.0.1';
const scriptDir = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(scriptDir, '..');
const repoRoot = resolve(workerRoot, '../..');

config({ path: resolve(repoRoot, '.env') });

function renderEnvContent(values) {
  return Object.entries(values)
    .filter(([, value]) => typeof value === 'string' && value.length > 0)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('\n') + '\n';
}

function terminateProcessTree(child) {
  if (!child || child.killed) return;
  if (process.platform === 'win32') {
    child.kill('SIGTERM');
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

function spawnCommand(command, args, options = {}) {
  return spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    ...options,
  });
}

function streamOutput(child, prefix) {
  child.stdout?.on('data', (c) => process.stdout.write(`${prefix}${c}`));
  child.stderr?.on('data', (c) => process.stderr.write(`${prefix}${c}`));
}

async function main() {
  const runId = randomUUID();
  const r2Prefix = `e2e-runs/${runId}`;
  const devVarsPath = resolve(workerRoot, '.dev.vars.test');

  console.log(`[e2e] run id: ${runId}`);

  console.log('[e2e] creating Neon branch...');
  const branch = await createTestBranch({ prefix: 'e2e' });
  await branch.runMigrations();
  console.log(`[e2e] branch ${branch.branchId} ready`);

  writeFileSync(devVarsPath, renderEnvContent({
    DATABASE_URL: branch.connectionString,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_TOKEN: process.env.FIREBASE_TOKEN,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    WORKSPACE_ROOT: r2Prefix,
  }));

  const port = String(await findAvailablePort(HOST));
  const inspectorPort = String(await findAvailablePort(HOST));
  // Use relative path — wrangler rejects absolute paths for --env-file
  const devVarsFileName = '.dev.vars.test';
  const worker = spawnCommand('pnpm', [
    'exec', '--', 'wrangler', 'dev',
    '--ip', HOST,
    '--port', port,
    '--inspector-port', inspectorPort,
    '--env-file', devVarsFileName,
  ], { cwd: workerRoot });
  streamOutput(worker, '[wrangler] ');

  const cleanup = async () => {
    console.log('[e2e] cleanup starting...');
    terminateProcessTree(worker);
    if (existsSync(devVarsPath)) rmSync(devVarsPath);
    try {
      const { deletedCount } = await cleanupPrefix(r2Prefix);
      console.log(`[e2e] deleted ${deletedCount} R2 objects under ${r2Prefix}`);
    } catch (err) {
      console.error(`[e2e] R2 cleanup failed:`, err);
      throw err;
    }
    try {
      await branch.deleteBranch();
      console.log(`[e2e] deleted Neon branch ${branch.branchId}`);
    } catch (err) {
      console.error(`[e2e] Neon branch cleanup failed:`, err);
      throw err;
    }
  };

  // Synchronous best-effort cleanup on abrupt exit
  process.on('exit', () => {
    terminateProcessTree(worker);
    if (existsSync(devVarsPath)) rmSync(devVarsPath);
  });

  let cleanupError;
  try {
    const baseUrl = `http://${HOST}:${port}`;
    console.log('[e2e] waiting for worker to be ready...');
    await waitForServer({ baseUrl, healthPath: '/health', child: worker, timeoutMs: 90_000 });
    console.log(`[e2e] worker ready at ${baseUrl}`);

    const runner = spawnCommand('pnpm', [
      'exec', 'vitest', 'run',
      '--config', 'vitest.live.config.ts',
    ], {
      cwd: workerRoot,
      env: {
        ...process.env,
        WORKER_BASE_URL: baseUrl,
        TEST_R2_PREFIX: r2Prefix,
      },
      stdio: 'inherit',
      detached: false,
    });

    const exitCode = await new Promise((resolveExit, rejectExit) => {
      runner.on('error', rejectExit);
      runner.on('exit', (code) => resolveExit(code ?? 1));
    });
    process.exitCode = exitCode;
  } catch (err) {
    console.error('[e2e] orchestrator error:', err);
    process.exitCode = 1;
  } finally {
    try {
      await cleanup();
    } catch (err) {
      cleanupError = err;
      process.exitCode = process.exitCode || 1;
    }
    await delay(300);
  }

  if (cleanupError) {
    console.error('[e2e] cleanup failed — test run marked as failed');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[e2e] fatal:', err);
  process.exit(1);
});
