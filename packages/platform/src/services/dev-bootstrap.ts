import { parseEnv } from '../env';
import { createOrganization, getOrganizationByFirebaseProjectId } from '../db/repositories/organizations';
import { createProjectChannel } from '../db/repositories/project-channels';
import { createProject } from '../db/repositories/projects';
import { upsertUser } from '../db/repositories/users';
import { addOrganizationMembership } from '../db/repositories/memberships';
import { provisionWorkspaceForProject } from '../workspace/provisioning';

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
}) {
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

  const provisioned = await provisionWorkspaceForProject({
    organizationId: organization.id,
    projectId: project.id,
    requestedBy: user.id,
    activeAgentRef: 'default',
    activeAgentVersion: 'v1',
  });

  const defaultChannel = await createProjectChannel({
    projectId: project.id,
    name: 'general',
    slug: 'general',
    description: 'Default workspace chat channel',
    createdBy: user.id,
  });

  return {
    projectId: project.id,
    organizationId: organization.id,
    defaultChannelId: defaultChannel.id,
    workspaceRootPath: provisioned.root.root_path,
    binding: {
      activeAgentRef: provisioned.binding.active_agent_ref,
      activeAgentVersion: provisioned.binding.active_agent_version,
    },
  };
}
