// ABOUTME: Port discovery and health-polling utilities for spawning a local wrangler dev server.
// ABOUTME: Adapted from iminds-examples/workers/dispatch-worker/scripts/live-smoke-utils.mjs.

import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import type { ChildProcess } from 'node:child_process';

export async function findAvailablePort(host = '127.0.0.1'): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to resolve available port')));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

export async function waitForServer(options: {
  baseUrl: string;
  healthPath?: string;
  child?: ChildProcess;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<void> {
  const healthPath = options.healthPath ?? '/health';
  const timeoutMs = options.timeoutMs ?? 60_000;
  const pollMs = options.pollMs ?? 250;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (options.child?.exitCode != null) {
      throw new Error(`server exited early with code ${options.child.exitCode}`);
    }
    try {
      const response = await fetch(`${options.baseUrl}${healthPath}`);
      if (response.ok) return;
    } catch {
      // keep polling
    }
    await delay(pollMs);
  }
  throw new Error(`timed out waiting for ${options.baseUrl}${healthPath}`);
}
