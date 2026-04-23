// ABOUTME: Shared test fixtures for integration tests — seeds an org/user/project/workspace
// ABOUTME: using real repositories + provisioning against the current DATABASE_URL (Neon branch).

import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace';

import { addOrganizationMembership } from '../../src/db/repositories/memberships';
import { createOrganization } from '../../src/db/repositories/organizations';
import { createProject } from '../../src/db/repositories/projects';
import { upsertUser } from '../../src/db/repositories/users';
import type { WorkspaceFactory } from '../../src/platform-deps';
import { provisionWorkspaceForProject } from '../../src/workspace/provisioning';

export type SeededProject = {
  user: { id: string; firebaseUid: string };
  organization: { id: string };
  project: { id: string };
  workspaceRootPath: string;
  workspaceFactory: WorkspaceFactory;
};

export function createLocalWorkspaceFactory(): WorkspaceFactory {
  return async (basePath: string) => {
    const workspace = new Workspace({
      filesystem: new LocalFilesystem({
        basePath,
        contained: true,
      }),
      sandbox: new LocalSandbox({
        workingDirectory: basePath,
        env: {
          PATH: process.env.PATH ?? '',
        },
      }),
    });

    await workspace.init();

    return workspace;
  };
}

export async function seedProjectFixture(
  options: {
    firebaseUid?: string;
    email?: string;
    projectName?: string;
  } = {},
): Promise<SeededProject> {
  const firebaseUid = options.firebaseUid ?? `test-${randomUUID()}`;
  const email = options.email ?? `${firebaseUid}@test.local`;
  const projectName = options.projectName ?? `Test Project ${firebaseUid.slice(0, 8)}`;
  const workspaceRoot = resolve(tmpdir(), 'hono-workspace-test', randomUUID());

  const organization = await createOrganization({
    name: `Test Org ${firebaseUid.slice(0, 8)}`,
    firebaseProjectId: 'test-project-id',
  });
  const user = await upsertUser({
    firebaseUid,
    email,
    displayName: firebaseUid,
  });
  await addOrganizationMembership({
    organizationId: organization.id,
    userId: user.id,
    role: 'owner',
  });
  const project = await createProject({
    organizationId: organization.id,
    name: projectName,
    slug: `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`,
  });
  const provisioned = await provisionWorkspaceForProject({
    organizationId: organization.id,
    projectId: project.id,
    requestedBy: user.id,
    activeAgentRef: 'default',
    activeAgentVersion: 'v1',
    workspaceRoot,
  });

  return {
    user: { id: user.id, firebaseUid },
    organization: { id: organization.id },
    project: { id: project.id },
    workspaceRootPath: provisioned.root.root_path,
    workspaceFactory: createLocalWorkspaceFactory(),
  };
}
