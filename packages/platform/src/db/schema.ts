import { pool } from './client';

export async function listAppTables(): Promise<string[]> {
  const result = await pool.query<{
    table_name: string;
  }>(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
    order by table_name asc
  `);

  return result.rows.map((row) => row.table_name);
}
