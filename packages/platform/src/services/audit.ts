import { getDatabasePool } from '../db/context';

export async function recordWorkspaceEvent(input: {
  workspaceRootId: string;
  eventType: string;
  actorUserId?: string;
  payloadJson?: Record<string, unknown>;
}) {
  await getDatabasePool().query(
    `
      insert into workspace_events(workspace_root_id, event_type, actor_user_id, payload_json)
      values($1, $2, $3, $4::jsonb)
    `,
    [
      input.workspaceRootId,
      input.eventType,
      input.actorUserId ?? null,
      JSON.stringify(input.payloadJson ?? {}),
    ],
  );
}
