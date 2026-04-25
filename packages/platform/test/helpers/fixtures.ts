// ABOUTME: Shared test fixtures for integration tests — seeds an org/user/project/mindspace
// ABOUTME: using real repositories + provisioning against the current DATABASE_URL (Neon branch).

import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace';

import { addOrganizationMembership, addProjectMembership } from '../../src/db/repositories/memberships';
import { createOrganization } from '../../src/db/repositories/organizations';
import { createProject } from '../../src/db/repositories/projects';
import { upsertUser } from '../../src/db/repositories/users';
import type { MindspaceFactory } from '../../src/platform-deps';
import { provisionMindspaceForProject } from '../../src/mindspace/provisioning';

export type SeededProject = {
  user: { id: string; firebaseUid: string };
  organization: { id: string };
  project: { id: string };
  mindspaceRootPath: string;
  mindspaceFactory: MindspaceFactory;
};

export function createLocalMindspaceFactory(): MindspaceFactory {
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
  const mindspaceRoot = resolve(tmpdir(), 'mastra-mindspace-test', randomUUID());

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
  await addProjectMembership({
    projectId: project.id,
    userId: user.id,
    role: 'owner',
  });
  const provisioned = await provisionMindspaceForProject({
    organizationId: organization.id,
    projectId: project.id,
    requestedBy: user.id,
    activeAgentRef: 'default',
    activeAgentVersion: 'v1',
    mindspaceRoot,
  });

  return {
    user: { id: user.id, firebaseUid },
    organization: { id: organization.id },
    project: { id: project.id },
    mindspaceRootPath: provisioned.root.root_path,
    mindspaceFactory: createLocalMindspaceFactory(),
  };
}
