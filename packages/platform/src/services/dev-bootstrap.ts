import type { Mastra } from '@mastra/core';

import { parseEnv } from '../env';
import { createOrganization, getOrganizationByFirebaseProjectId } from '../db/repositories/organizations';
import { createProjectChannel } from '../db/repositories/project-channels';
import { createProject } from '../db/repositories/projects';
import { seedProjectMindConfigs } from '../db/repositories/project-mind-configs';
import { upsertUser } from '../db/repositories/users';
import { addOrganizationMembership, addProjectMembership } from '../db/repositories/memberships';
import { provisionMindspaceForProject } from '../mindspace/provisioning';
import { createSeedThread } from './channel-seeding';

function slugifyProjectName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export async function bootstrapProjectForPrincipal(input: {
  uid: string;
  email: string | null;
  name: string | null;
  projectName?: string;
}, deps?: { mastra?: Mastra }) {
  const env = parseEnv(process.env);
  const projectName = input.projectName?.trim() || 'Demo Project';
  const organization =
    (await getOrganizationByFirebaseProjectId(env.firebaseProjectId)) ??
    (await createOrganization({
      name: 'Local Development',
      firebaseProjectId: env.firebaseProjectId,
    }));

  const user = await upsertUser({
    firebaseUid: input.uid,
    email: input.email,
    displayName: input.name,
  });

  await addOrganizationMembership({
    organizationId: organization.id,
    userId: user.id,
    role: 'owner',
  });

  const project = await createProject({
    organizationId: organization.id,
    name: projectName,
    slug: `${slugifyProjectName(projectName)}-${Date.now().toString(36)}`,
  });
  await addProjectMembership({
    projectId: project.id,
    userId: user.id,
    role: 'owner',
  });
  await seedProjectMindConfigs(project.id);

  const provisioned = await provisionMindspaceForProject({
    organizationId: organization.id,
    projectId: project.id,
    requestedBy: user.id,
    activeAgentRef: 'default',
    activeAgentVersion: 'v1',
    mindspaceRoot: env.mindspaceRoot,
  });

  const defaultChannel = await createProjectChannel({
    projectId: project.id,
    name: 'general',
    slug: 'general',
    description: 'Default mindspace chat channel',
    createdBy: user.id,
  });

  let seedThread: { threadId: string; channelId: string } | undefined;
  if (deps?.mastra) {
    const storage = deps.mastra.getStorage();
    const memoryStore = await storage?.getStore('memory');

    if (memoryStore) {
      seedThread = await createSeedThread({
        channelId: defaultChannel.id,
        channelName: 'general',
        projectId: project.id,
        memoryStore,
        seedMessage: '@librarian Welcome! Give a brief orientation to this mindspace.',
      });
    }
  }

  return {
    projectId: project.id,
    organizationId: organization.id,
    defaultChannelId: defaultChannel.id,
    mindspaceRootPath: provisioned.root.root_path,
    project: {
      id: project.id,
      organizationId: organization.id,
      name: project.name,
      slug: project.slug,
      status: project.status,
    },
    binding: {
      activeAgentRef: provisioned.binding.active_agent_ref,
      activeAgentVersion: provisioned.binding.active_agent_version,
    },
    ...(seedThread ? { seedThread } : {}),
  };
}
