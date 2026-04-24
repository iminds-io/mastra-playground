import { rm } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@mastra/core/request-context';

import { pool } from '../../src/db/client';
import type { ProjectAgentRequestContext } from '../../src/mastra/execution/request-context';
import { addOrganizationMembership } from '../../src/db/repositories/memberships';
import { createOrganization } from '../../src/db/repositories/organizations';
import { createProject } from '../../src/db/repositories/projects';
import { upsertUser } from '../../src/db/repositories/users';
import { executeProjectAgent } from '../../src/mastra/execution/execute-agent';
import { provisionMindspaceForProject } from '../../src/mindspace/provisioning';

describe('executeProjectAgent', () => {
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

    await rm('/Users/pureicis/dev/mastra-playground/hono-mindspace/var/workspaces', {
      recursive: true,
      force: true,
    });
  });

  it('returns model text from the resolved project execution context', async () => {
    const organization = await createOrganization({
      name: 'Demo Org',
      firebaseProjectId: 'mindmap-aff6a',
    });
    const user = await upsertUser({
      firebaseUid: 'firebase-user-1',
      email: 'user@example.com',
      displayName: 'Demo User',
    });
    const project = await createProject({
      organizationId: organization.id,
      name: 'Demo Project',
      slug: 'demo-project',
    });

    await addOrganizationMembership({
      organizationId: organization.id,
      userId: user.id,
      role: 'owner',
    });

    await provisionMindspaceForProject({
      organizationId: organization.id,
      projectId: project.id,
      requestedBy: user.id,
      activeAgentRef: 'default',
      activeAgentVersion: 'v1',
      mindspaceRoot: '/Users/pureicis/dev/mastra-playground/hono-mindspace/var/workspaces',
    });

    const workspace = { filesystem: {} };
    const mindspaceFactory = vi.fn(async () => workspace as never);
    const result = await executeProjectAgent(
      {
        firebaseUid: 'firebase-user-1',
        projectId: project.id,
        message: 'hello',
      },
      {
        mastra: {
          getAgent() {
            return {
              async generate(
                message: string,
                options: {
                  requestContext: RequestContext<ProjectAgentRequestContext>;
                  resourceId: string;
                  threadId: string;
                },
              ) {
                expect(message).toBe('hello');
                expect(options.resourceId).toBe(`project:${project.id}`);
                expect(options.threadId).toBe(project.id);
                expect(options.requestContext?.get('projectId')).toBe(project.id);
                expect(options.requestContext?.get('workspace')).toBe(workspace);

                return {
                  text: 'Project agent says hello.',
                  runId: 'run-123',
                  response: {
                    modelId: 'openai/gpt-4.1-mini',
                  },
                };
              },
            };
          },
        },
        mindspaceFactory,
      } as never,
    );

    expect(mindspaceFactory).toHaveBeenCalledTimes(1);
    expect(result.resourceId).toBe(`project:${project.id}`);
    expect(result.mindspaceRootPath).toContain(`project_${project.id}`);
    expect(result.threadId).toBe(project.id);
    expect(result.runId).toBe('run-123');
    expect(result.modelId).toBe('openai/gpt-4.1-mini');
    expect(result.text).toBe('Project agent says hello.');
  });
});

describe('executeProjectAgent with real Mastra PG', () => {
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
    'persists the thread via @mastra/pg when generating a reply',
    { timeout: 60_000 },
    async () => {
      const { createMastra } = await import('../../src/mastra/create-mastra');
      const { seedProjectFixture } = await import('../helpers/fixtures');
      const { neon } = await import('@neondatabase/serverless');

      const fixture = await seedProjectFixture();

      const mastra = createMastra(process.env.DATABASE_URL!, {
        openrouterApiKey: process.env.OPENROUTER_API_KEY!,
        openrouterModel: process.env.OPENROUTER_MODEL,
      });

      const result = await executeProjectAgent(
        {
          firebaseUid: fixture.user.firebaseUid,
          projectId: fixture.project.id,
          message: 'respond with the single word "ok" and nothing else',
        },
        { mastra, mindspaceFactory: fixture.mindspaceFactory },
      );

      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.threadId).toBe(fixture.project.id);

      // Verify Mastra persisted its tables on the Neon branch
      const sql = neon(process.env.DATABASE_URL!);
      const tables = await sql.query(
        "select tablename from pg_tables where schemaname = 'public' and tablename like 'mastra%'",
      );
      const tableNames = (tables as Array<{ tablename: string }>).map((r) => r.tablename);
      expect(tableNames.length).toBeGreaterThan(0);
    },
  );
});
