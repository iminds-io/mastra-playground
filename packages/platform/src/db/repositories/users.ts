import { getDatabasePool } from '../context';

export type UserRecord = {
  id: string;
  firebase_uid: string;
  email: string | null;
  display_name: string | null;
};

export async function upsertUser(input: {
  firebaseUid: string;
  email: string | null;
  displayName: string | null;
}): Promise<UserRecord> {
  const result = await getDatabasePool().query<UserRecord>(
    `
      insert into users(firebase_uid, email, display_name)
      values($1, $2, $3)
      on conflict(firebase_uid)
      do update set
        email = excluded.email,
        display_name = excluded.display_name,
        updated_at = now()
      returning id, firebase_uid, email, display_name
    `,
    [input.firebaseUid, input.email, input.displayName],
  );

  return result.rows[0]!;
}

export async function getUserByFirebaseUid(firebaseUid: string): Promise<UserRecord | null> {
  const result = await getDatabasePool().query<UserRecord>(
    `
      select id, firebase_uid, email, display_name
      from users
      where firebase_uid = $1
    `,
    [firebaseUid],
  );

  return result.rows[0] ?? null;
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const result = await getDatabasePool().query<UserRecord>(
    `
      select id, firebase_uid, email, display_name
      from users
      where lower(email) = lower($1)
      limit 1
    `,
    [email],
  );

  return result.rows[0] ?? null;
}

export async function listUsersByIds(userIds: string[]): Promise<UserRecord[]> {
  if (userIds.length === 0) {
    return [];
  }

  const result = await getDatabasePool().query<UserRecord>(
    `
      select id, firebase_uid, email, display_name
      from users
      where id = any($1::uuid[])
      order by display_name asc nulls last, email asc nulls last
    `,
    [userIds],
  );

  return result.rows;
}
