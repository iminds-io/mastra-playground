import { rm } from 'node:fs/promises';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RequestContext } from '@mastra/core/request-context';

import { pool } from '../../src/db/client';
import type { ProjectAgentRequestContext } from '../../src/mastra/execution/request-context';
import { addOrganizationMembership } from '../../src/db/repositories/memberships';
import { createOrganization } from '../../src/db/repositories/organizations';
import { createProject } from '../../src/db/repositories/projects';
import { upsertUser } from '../../src/db/repositories/users';
import { executeProjectAgent } from '../../src/mastra/execution/execute-agent';
import '../../src/workspace/factory';
import { provisionWorkspaceForProject } from '../../src/workspace/provisioning';

describe('executeProjectAgent', () => {
  beforeEach(async () => {
    await pool.query(`
      truncate table
        channel_threads,
        project_channels,
        workspace_provisioning_jobs,
        workspace_events,
        workspace_locks,
        workspace_bindings,
        workspace_roots,
        organization_memberships,
        projects,
        users,
        organizations
      restart identity cascade
    `);

    await rm('/Users/pureicis/dev/mastra-playground/hono-workspace/var/workspaces', {
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

    await provisionWorkspaceForProject({
      organizationId: organization.id,
      projectId: project.id,
      requestedBy: user.id,
      activeAgentRef: 'default',
      activeAgentVersion: 'v1',
      workspaceRoot: '/Users/pureicis/dev/mastra-playground/hono-workspace/var/workspaces',
    });

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
                expect(options.requestContext?.get('workspace')).toBeDefined();

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
      },
    );

    expect(result.resourceId).toBe(`project:${project.id}`);
    expect(result.workspaceRootPath).toContain(`project_${project.id}`);
    expect(result.threadId).toBe(project.id);
    expect(result.runId).toBe('run-123');
    expect(result.modelId).toBe('openai/gpt-4.1-mini');
    expect(result.text).toBe('Project agent says hello.');
  });
});
