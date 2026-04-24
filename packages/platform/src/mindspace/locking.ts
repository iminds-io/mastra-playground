import { getDatabasePool } from '../db/context';

export type MindspaceLock = {
  lockId: string;
};

export function createMindspaceLockService() {
  return {
    async acquire(params: {
      mindspaceRootId: string;
      lockType: 'write' | 'command';
      holder: string;
      ttlSeconds: number;
    }): Promise<MindspaceLock> {
      const pool = getDatabasePool();
      await pool.query('delete from mindspace_locks where expires_at <= now()');

      const existing = await pool.query<{ id: string }>(
        `
          select id
          from mindspace_locks
          where mindspace_root_id = $1
            and expires_at > now()
          limit 1
        `,
        [params.mindspaceRootId],
      );

      if (existing.rows[0]) {
        throw new Error('mindspace lock already exists');
      }

      const result = await pool.query<{ id: string }>(
        `
          insert into mindspace_locks(mindspace_root_id, lock_type, holder, expires_at)
          values($1, $2, $3, now() + ($4 || ' seconds')::interval)
          returning id
        `,
        [params.mindspaceRootId, params.lockType, params.holder, String(params.ttlSeconds)],
      );

      return {
        lockId: result.rows[0]!.id,
      };
    },

    async release(lockId: string): Promise<void> {
      await getDatabasePool().query('delete from mindspace_locks where id = $1', [lockId]);
    },
  };
}
