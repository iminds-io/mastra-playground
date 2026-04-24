import { getDatabasePool } from '../db/context';

export async function recordMindspaceEvent(input: {
  mindspaceRootId: string;
  eventType: string;
  actorUserId?: string;
  payloadJson?: Record<string, unknown>;
}) {
  await getDatabasePool().query(
    `
      insert into mindspace_events(mindspace_root_id, event_type, actor_user_id, payload_json)
      values($1, $2, $3, $4::jsonb)
    `,
    [
      input.mindspaceRootId,
      input.eventType,
      input.actorUserId ?? null,
      JSON.stringify(input.payloadJson ?? {}),
    ],
  );
}
