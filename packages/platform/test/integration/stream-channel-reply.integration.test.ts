// ABOUTME: Integration test for streamChannelReplyForPrincipal — verifies SSE event ordering
// ABOUTME: against a real Neon branch and real Mastra (requires OPENROUTER_API_KEY).

import { beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../../src/db/client';

describe('streamChannelReplyForPrincipal', () => {
  beforeEach(async () => {
    await pool.query(`
      truncate table
        channel_threads,
        project_channels,
        mindspace_provisioning_jobs,
        mindspace_events,
        mindspace_locks,
        mindspace_bindings,
        mindspace_roots,
        organization_memberships,
        projects,
        users,
        organizations
      restart identity cascade
    `);
  });

  it.skipIf(!process.env.OPENROUTER_API_KEY)(
    'yields ack, token(s), and done events in order',
    { timeout: 60_000 },
    async () => {
      const { createMastra } = await import('../../src/mastra/create-mastra');
      const { seedProjectFixture } = await import('../helpers/fixtures');
      const {
        createProjectChannelForPrincipal,
        createChannelPostForPrincipal,
        streamChannelReplyForPrincipal,
      } = await import('../../src/services/chat');

      const fixture = await seedProjectFixture();
      const mastra = createMastra(process.env.DATABASE_URL!, {
        openrouterApiKey: process.env.OPENROUTER_API_KEY!,
        openrouterModel: process.env.OPENROUTER_MODEL,
      });

      const channel = await createProjectChannelForPrincipal({
        firebaseUid: fixture.user.firebaseUid,
        projectId: fixture.project.id,
        name: 'general',
      });

      const post = await createChannelPostForPrincipal(
        {
          firebaseUid: fixture.user.firebaseUid,
          projectId: fixture.project.id,
          channelId: channel.channel.id,
          message: 'hello',
        },
        { mastra, mindspaceFactory: fixture.mindspaceFactory },
      );

      const events: Array<{ event: string; data: Record<string, unknown> }> = [];
      for await (const ev of streamChannelReplyForPrincipal(
        {
          firebaseUid: fixture.user.firebaseUid,
          projectId: fixture.project.id,
          channelId: channel.channel.id,
          threadId: post.thread.id,
          message: 'respond with the single word "ok"',
        },
        { mastra, mindspaceFactory: fixture.mindspaceFactory },
      )) {
        events.push(ev);
      }

      const kinds = events.map((e) => e.event);
      expect(kinds[0]).toBe('ack');
      expect(kinds).toContain('token');
      expect(kinds.at(-1)).toBe('done');
    },
  );
});
