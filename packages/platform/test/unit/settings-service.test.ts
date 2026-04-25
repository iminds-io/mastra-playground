import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoadProjectContext = vi.fn();
const mockGetProjectDetail = vi.fn();
const mockUpdateProjectName = vi.fn();
const mockArchiveProject = vi.fn();
const mockListProjectMemberships = vi.fn();
const mockGetProjectMembership = vi.fn();
const mockAddProjectMembership = vi.fn();
const mockRemoveProjectMembership = vi.fn();
const mockGetUserByEmail = vi.fn();
const mockListUsersByIds = vi.fn();
const mockCreateProjectInvitation = vi.fn();
const mockListProjectInvitations = vi.fn();
const mockListProjectMindConfigs = vi.fn();
const mockSeedProjectMindConfigs = vi.fn();
const mockGetProjectMindConfigById = vi.fn();
const mockUpdateProjectMindConfig = vi.fn();

vi.mock('../../src/services/project-context', () => ({
  loadProjectContext: (...args: unknown[]) => mockLoadProjectContext(...args),
}));

vi.mock('../../src/db/repositories/projects', () => ({
  getProjectDetail: (...args: unknown[]) => mockGetProjectDetail(...args),
  updateProjectName: (...args: unknown[]) => mockUpdateProjectName(...args),
  archiveProject: (...args: unknown[]) => mockArchiveProject(...args),
}));

vi.mock('../../src/db/repositories/memberships', () => ({
  listProjectMemberships: (...args: unknown[]) => mockListProjectMemberships(...args),
  getProjectMembership: (...args: unknown[]) => mockGetProjectMembership(...args),
  addProjectMembership: (...args: unknown[]) => mockAddProjectMembership(...args),
  removeProjectMembership: (...args: unknown[]) => mockRemoveProjectMembership(...args),
}));

vi.mock('../../src/db/repositories/users', () => ({
  getUserByEmail: (...args: unknown[]) => mockGetUserByEmail(...args),
  listUsersByIds: (...args: unknown[]) => mockListUsersByIds(...args),
}));

vi.mock('../../src/db/repositories/project-invitations', () => ({
  createProjectInvitation: (...args: unknown[]) => mockCreateProjectInvitation(...args),
  listProjectInvitations: (...args: unknown[]) => mockListProjectInvitations(...args),
}));

vi.mock('../../src/db/repositories/project-mind-configs', () => ({
  listProjectMindConfigs: (...args: unknown[]) => mockListProjectMindConfigs(...args),
  seedProjectMindConfigs: (...args: unknown[]) => mockSeedProjectMindConfigs(...args),
  getProjectMindConfigById: (...args: unknown[]) => mockGetProjectMindConfigById(...args),
  updateProjectMindConfig: (...args: unknown[]) => mockUpdateProjectMindConfig(...args),
}));

import { AccessDeniedError } from '../../src/services/access-control';
import {
  archiveProjectForPrincipal,
  getProjectGeneralSettingsForPrincipal,
  inviteProjectMemberForPrincipal,
  listProjectSettingsMembersForPrincipal,
  listProjectMindConfigsForPrincipal,
  updateProjectGeneralSettingsForPrincipal,
  updateProjectMindConfigForPrincipal,
  removeProjectMemberForPrincipal,
} from '../../src/services/settings';

describe('settings service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadProjectContext.mockResolvedValue({
      actorUserId: 'user-1',
      organizationId: 'org-1',
      projectId: 'project-1',
      role: 'owner',
      resourceId: 'project:project-1',
    });
    mockGetProjectDetail.mockResolvedValue({
      id: 'project-1',
      organization_id: 'org-1',
      name: 'Alpha',
      slug: 'alpha',
      status: 'active',
      created_at: new Date('2026-04-24T00:00:00Z'),
    });
    mockListProjectMemberships.mockResolvedValue([]);
    mockListProjectInvitations.mockResolvedValue([]);
    mockListProjectMindConfigs.mockResolvedValue([]);
    mockSeedProjectMindConfigs.mockResolvedValue([]);
    mockListUsersByIds.mockResolvedValue([]);
    mockGetProjectMembership.mockResolvedValue(null);
  });

  it('returns general settings for a project member', async () => {
    const result = await getProjectGeneralSettingsForPrincipal({
      firebaseUid: 'firebase-1',
      projectId: 'project-1',
    });

    expect(mockLoadProjectContext).toHaveBeenCalled();
    expect(result.project.name).toBe('Alpha');
    expect(result.role).toBe('owner');
  });

  it('blocks project mutations for non-admin members', async () => {
    mockLoadProjectContext.mockResolvedValueOnce({
      actorUserId: 'user-2',
      organizationId: 'org-1',
      projectId: 'project-1',
      role: 'member',
      resourceId: 'project:project-1',
    });

    await expect(
      updateProjectGeneralSettingsForPrincipal({
        firebaseUid: 'firebase-1',
        projectId: 'project-1',
        name: 'Renamed',
      }),
    ).rejects.toThrow(AccessDeniedError);
  });

  it('updates and archives project metadata for admins', async () => {
    mockUpdateProjectName.mockResolvedValue({
      id: 'project-1',
      organization_id: 'org-1',
      name: 'Renamed',
      slug: 'alpha',
      status: 'active',
    });
    mockArchiveProject.mockResolvedValue({
      id: 'project-1',
      organization_id: 'org-1',
      name: 'Renamed',
      slug: 'alpha',
      status: 'archived',
    });

    expect((await updateProjectGeneralSettingsForPrincipal({
      firebaseUid: 'firebase-1',
      projectId: 'project-1',
      name: 'Renamed',
    })).project.name).toBe('Renamed');

    expect((await archiveProjectForPrincipal({
      firebaseUid: 'firebase-1',
      projectId: 'project-1',
    })).project.status).toBe('archived');
  });

  it('lists memberships and invitations', async () => {
    mockListProjectMemberships.mockResolvedValue([
      { id: 'membership-1', project_id: 'project-1', user_id: 'user-1', role: 'owner' },
    ]);
    mockListProjectInvitations.mockResolvedValue([
      { id: 'invite-1', project_id: 'project-1', email: 'new@example.com', role: 'member', invited_by_user_id: 'user-1', status: 'pending' },
    ]);

    const result = await listProjectSettingsMembersForPrincipal({
      firebaseUid: 'firebase-1',
      projectId: 'project-1',
    });

    expect(result.members).toHaveLength(1);
    expect(result.invitations).toHaveLength(1);
  });

  it('invites a known user and grants membership immediately', async () => {
    mockGetUserByEmail.mockResolvedValue({
      id: 'user-2',
      firebase_uid: 'firebase-2',
      email: 'known@example.com',
      display_name: 'Known User',
    });
    mockCreateProjectInvitation.mockResolvedValue({
      id: 'invite-1',
      project_id: 'project-1',
      email: 'known@example.com',
      role: 'member',
      invited_by_user_id: 'user-1',
      status: 'pending',
    });
    mockAddProjectMembership.mockResolvedValue({
      id: 'membership-2',
      project_id: 'project-1',
      user_id: 'user-2',
      role: 'member',
    });

    const result = await inviteProjectMemberForPrincipal({
      firebaseUid: 'firebase-1',
      projectId: 'project-1',
      email: 'known@example.com',
      role: 'member',
    });

    expect(mockAddProjectMembership).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-2',
      role: 'member',
    });
    expect(result.membership?.user_id).toBe('user-2');
    expect(result.invitation.status).toBe('pending');
  });

  it('does not remove the last owner', async () => {
    mockListProjectMemberships.mockResolvedValue([
      { id: 'membership-1', project_id: 'project-1', user_id: 'user-1', role: 'owner' },
    ]);

    await expect(
      removeProjectMemberForPrincipal({
        firebaseUid: 'firebase-1',
        projectId: 'project-1',
        membershipId: 'membership-1',
      }),
    ).rejects.toThrow(AccessDeniedError);
  });

  it('lists and updates known project mind configs', async () => {
    mockListProjectMindConfigs.mockResolvedValue([
      {
        id: 'mind-1',
        project_id: 'project-1',
        agent_id: 'librarian',
        display_name: 'Librarian',
        icon: '📚',
        blurb: 'Guide',
        enabled: true,
        prompt_override: null,
      },
    ]);
    mockGetProjectMindConfigById.mockResolvedValue({
      id: 'mind-1',
      project_id: 'project-1',
      agent_id: 'librarian',
      display_name: 'Librarian',
      icon: '📚',
      blurb: 'Guide',
      enabled: true,
      prompt_override: null,
    });
    mockUpdateProjectMindConfig.mockResolvedValue({
      id: 'mind-1',
      project_id: 'project-1',
      agent_id: 'librarian',
      display_name: 'Archivist',
      icon: '📚',
      blurb: 'Guide',
      enabled: true,
      prompt_override: null,
    });

    expect((await listProjectMindConfigsForPrincipal({
      firebaseUid: 'firebase-1',
      projectId: 'project-1',
    })).minds).toHaveLength(1);

    const updateResult = await updateProjectMindConfigForPrincipal({
      firebaseUid: 'firebase-1',
      projectId: 'project-1',
      mindId: 'mind-1',
      displayName: 'Archivist',
    });

    expect(updateResult.mind?.display_name).toBe('Archivist');
  });
});
