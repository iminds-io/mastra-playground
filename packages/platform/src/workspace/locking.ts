import { getDatabasePool } from '../db/context';

export type WorkspaceLock = {
  lockId: string;
};

export function createWorkspaceLockService() {
  return {
    async acquire(params: {
      workspaceRootId: string;
      lockType: 'write' | 'command';
      holder: string;
      ttlSeconds: number;
    }): Promise<WorkspaceLock> {
      const pool = getDatabasePool();
      await pool.query('delete from workspace_locks where expires_at <= now()');

      const existing = await pool.query<{ id: string }>(
        `
          select id
          from workspace_locks
          where workspace_root_id = $1
            and expires_at > now()
          limit 1
        `,
        [params.workspaceRootId],
      );

      if (existing.rows[0]) {
        throw new Error('workspace lock already exists');
      }

      const result = await pool.query<{ id: string }>(
        `
          insert into workspace_locks(workspace_root_id, lock_type, holder, expires_at)
          values($1, $2, $3, now() + ($4 || ' seconds')::interval)
          returning id
        `,
        [params.workspaceRootId, params.lockType, params.holder, String(params.ttlSeconds)],
      );

      return {
        lockId: result.rows[0]!.id,
      };
    },

    async release(lockId: string): Promise<void> {
      await getDatabasePool().query('delete from workspace_locks where id = $1', [lockId]);
    },
  };
}
