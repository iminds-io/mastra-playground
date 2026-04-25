import {
  archiveProject,
  getProjectDetail,
  updateProjectName,
} from '../db/repositories/projects';
import {
  addProjectMembership,
  getProjectMembership,
  listProjectMemberships,
  removeProjectMembership,
} from '../db/repositories/memberships';
import {
  createProjectInvitation,
  listProjectInvitations,
  revokeProjectInvitation,
} from '../db/repositories/project-invitations';
import {
  getProjectMindConfigById,
  listProjectMindConfigs,
  seedProjectMindConfigs,
  updateProjectMindConfig,
} from '../db/repositories/project-mind-configs';
import { getUserByEmail, listUsersByIds } from '../db/repositories/users';
import { AccessDeniedError } from './access-control';
import { loadProjectContext } from './project-context';

function canManageProject(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

async function requireProjectSettingsAccess(input: {
  firebaseUid: string;
  projectId: string;
}) {
  return loadProjectContext(input);
}

async function requireProjectSettingsManager(input: {
  firebaseUid: string;
  projectId: string;
}) {
  const context = await loadProjectContext(input);
  if (!canManageProject(context.role)) {
    throw new AccessDeniedError('Only project admins can change settings');
  }
  return context;
}

export async function getProjectGeneralSettingsForPrincipal(input: {
  firebaseUid: string;
  projectId: string;
}) {
  const context = await requireProjectSettingsAccess(input);
  const project = await getProjectDetail(input.projectId);

  if (!project) {
    throw new AccessDeniedError('Project not found');
  }

  return {
    role: context.role,
    project: {
      id: project.id,
      organizationId: project.organization_id,
      name: project.name,
      slug: project.slug,
      status: project.status,
      createdAt: project.created_at.toISOString(),
    },
  };
}

export async function updateProjectGeneralSettingsForPrincipal(input: {
  firebaseUid: string;
  projectId: string;
  name: string;
}) {
  await requireProjectSettingsManager(input);
  const project = await updateProjectName({
    projectId: input.projectId,
    name: input.name.trim(),
  });

  return {
    project: {
      id: project.id,
      organizationId: project.organization_id,
      name: project.name,
      slug: project.slug,
      status: project.status,
    },
  };
}

export async function archiveProjectForPrincipal(input: {
  firebaseUid: string;
  projectId: string;
}) {
  await requireProjectSettingsManager(input);
  const project = await archiveProject(input.projectId);

  return {
    project: {
      id: project.id,
      organizationId: project.organization_id,
      name: project.name,
      slug: project.slug,
      status: project.status,
    },
  };
}

export async function listProjectSettingsMembersForPrincipal(input: {
  firebaseUid: string;
  projectId: string;
}) {
  const context = await requireProjectSettingsAccess(input);
  const memberships = await listProjectMemberships(input.projectId);
  const invitations = await listProjectInvitations(input.projectId);
  const users = await listUsersByIds(memberships.map((membership) => membership.user_id));
  const userMap = new Map(users.map((user) => [user.id, user]));

  return {
    role: context.role,
    members: memberships.map((membership) => {
      const user = userMap.get(membership.user_id);
      return {
        membershipId: membership.id,
        userId: membership.user_id,
        role: membership.role,
        displayName: user?.display_name ?? user?.email ?? membership.user_id,
        email: user?.email ?? null,
      };
    }),
    invitations: invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
    })),
  };
}

export async function inviteProjectMemberForPrincipal(input: {
  firebaseUid: string;
  projectId: string;
  email: string;
  role: string;
}) {
  const context = await requireProjectSettingsManager(input);
  const normalizedEmail = input.email.trim().toLowerCase();
  const existingUser = await getUserByEmail(normalizedEmail);

  let membership:
    | {
        id: string;
        project_id: string;
        user_id: string;
        role: string;
      }
    | undefined;

  if (existingUser) {
    const existingMembership = await getProjectMembership({
      projectId: input.projectId,
      userId: existingUser.id,
    });

    membership = existingMembership ?? await addProjectMembership({
      projectId: input.projectId,
      userId: existingUser.id,
      role: input.role,
    });
  }

  const invitations = await listProjectInvitations(input.projectId);
  const existingInvitation = invitations.find(
    (invitation) => invitation.status === 'pending' && invitation.email.toLowerCase() === normalizedEmail,
  );

  const invitation = existingInvitation ?? await createProjectInvitation({
    projectId: input.projectId,
    email: normalizedEmail,
    role: input.role,
    invitedByUserId: context.actorUserId,
  });

  return {
    invitation,
    ...(membership ? { membership } : {}),
  };
}

export async function removeProjectMemberForPrincipal(input: {
  firebaseUid: string;
  projectId: string;
  membershipId: string;
}) {
  await requireProjectSettingsManager(input);
  const memberships = await listProjectMemberships(input.projectId);
  const membership = memberships.find((entry) => entry.id === input.membershipId);

  if (!membership) {
    throw new AccessDeniedError('Project membership not found');
  }

  const ownerCount = memberships.filter((entry) => entry.role === 'owner').length;
  if (membership.role === 'owner' && ownerCount <= 1) {
    throw new AccessDeniedError('Cannot remove the last project owner');
  }

  const removed = await removeProjectMembership({
    projectId: input.projectId,
    membershipId: input.membershipId,
  });

  return { membership: removed };
}

export async function revokeProjectInvitationForPrincipal(input: {
  firebaseUid: string;
  projectId: string;
  invitationId: string;
}) {
  await requireProjectSettingsManager(input);
  const invitation = await revokeProjectInvitation({
    projectId: input.projectId,
    invitationId: input.invitationId,
  });

  return { invitation };
}

export async function listProjectMindConfigsForPrincipal(input: {
  firebaseUid: string;
  projectId: string;
}) {
  const context = await requireProjectSettingsAccess(input);
  let minds = await listProjectMindConfigs(input.projectId);
  if (minds.length === 0) {
    await seedProjectMindConfigs(input.projectId);
    minds = await listProjectMindConfigs(input.projectId);
  }

  return {
    role: context.role,
    minds,
  };
}

export async function updateProjectMindConfigForPrincipal(input: {
  firebaseUid: string;
  projectId: string;
  mindId: string;
  displayName?: string;
  icon?: string;
  blurb?: string | null;
  enabled?: boolean;
  promptOverride?: string | null;
}) {
  await requireProjectSettingsManager(input);
  const existing = await getProjectMindConfigById({
    projectId: input.projectId,
    mindId: input.mindId,
  });

  if (!existing) {
    throw new AccessDeniedError('Project mind config not found');
  }

  const mind = await updateProjectMindConfig({
    projectId: input.projectId,
    mindId: input.mindId,
    ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    ...(input.icon !== undefined ? { icon: input.icon } : {}),
    ...(input.blurb !== undefined ? { blurb: input.blurb } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.promptOverride !== undefined ? { promptOverride: input.promptOverride } : {}),
  });

  return { mind };
}
