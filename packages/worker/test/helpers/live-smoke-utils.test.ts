import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { findAvailablePort, waitForServer } from './live-smoke-utils';

describe('live-smoke-utils', () => {
  describe('findAvailablePort', () => {
    it('returns a port number between 1024 and 65535', async () => {
      const port = await findAvailablePort();
      expect(port).toBeGreaterThan(1024);
      expect(port).toBeLessThan(65536);
    });

    it('returns a number on successive calls', async () => {
      const a = await findAvailablePort();
      const b = await findAvailablePort();
      expect(typeof a).toBe('number');
      expect(typeof b).toBe('number');
    });
  });

  describe('waitForServer', () => {
    it('resolves when server responds 200 on health path', async () => {
      const server = createServer((req, res) => {
        if (req.url === '/health') {
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end('ok');
          return;
        }
        res.writeHead(404);
        res.end();
      });
      const port = await new Promise<number>((resolveListen) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          if (addr && typeof addr === 'object') resolveListen(addr.port);
        });
      });
      try {
        await waitForServer({
          baseUrl: `http://127.0.0.1:${port}`,
          healthPath: '/health',
          timeoutMs: 2_000,
          pollMs: 100,
        });
      } finally {
        server.close();
      }
    });

    it('throws when deadline exceeded', async () => {
      await expect(
        waitForServer({
          baseUrl: 'http://127.0.0.1:1',
          healthPath: '/health',
          timeoutMs: 300,
          pollMs: 100,
        }),
      ).rejects.toThrow(/timed out/i);
    });
  });
});
