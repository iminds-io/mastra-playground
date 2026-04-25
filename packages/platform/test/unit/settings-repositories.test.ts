import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../src/db/context', () => ({
  getDatabasePool: () => ({ query: mockQuery }),
}));

import {
  archiveProject,
  getProjectById,
  getProjectDetail,
  updateProjectName,
} from '../../src/db/repositories/projects';
import {
  addProjectMembership,
  getProjectMembership,
  listProjectMemberships,
  removeProjectMembership,
} from '../../src/db/repositories/memberships';
import { getUserByEmail } from '../../src/db/repositories/users';
import {
  createProjectInvitation,
  listProjectInvitations,
  revokeProjectInvitation,
} from '../../src/db/repositories/project-invitations';
import {
  getProjectMindConfigById,
  listProjectMindConfigs,
  seedProjectMindConfigs,
  updateProjectMindConfig,
} from '../../src/db/repositories/project-mind-configs';

describe('settings repositories', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('gets and updates project records', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'project-1', organization_id: 'org-1', name: 'Alpha', slug: 'alpha', status: 'active' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'project-1', organization_id: 'org-1', name: 'Alpha', slug: 'alpha', status: 'active', created_at: new Date('2026-04-24T00:00:00Z') }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'project-1', organization_id: 'org-1', name: 'Renamed', slug: 'alpha', status: 'active' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'project-1', organization_id: 'org-1', name: 'Renamed', slug: 'alpha', status: 'archived' }],
        rowCount: 1,
      });

    expect(await getProjectById('project-1')).toEqual({
      id: 'project-1',
      organization_id: 'org-1',
      name: 'Alpha',
      slug: 'alpha',
      status: 'active',
    });
    expect((await getProjectDetail('project-1'))?.created_at.toISOString()).toBe('2026-04-24T00:00:00.000Z');
    expect((await updateProjectName({ projectId: 'project-1', name: 'Renamed' })).name).toBe('Renamed');
    expect((await archiveProject('project-1')).status).toBe('archived');
  });

  it('lists and mutates project memberships', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'membership-1', project_id: 'project-1', user_id: 'user-1', role: 'owner' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'membership-1', project_id: 'project-1', user_id: 'user-1', role: 'owner' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'membership-2', project_id: 'project-1', user_id: 'user-2', role: 'member' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'membership-2', project_id: 'project-1', user_id: 'user-2', role: 'member' }],
        rowCount: 1,
      });

    expect(await listProjectMemberships('project-1')).toHaveLength(1);
    expect((await getProjectMembership({ projectId: 'project-1', userId: 'user-1' }))?.role).toBe('owner');
    expect((await addProjectMembership({ projectId: 'project-1', userId: 'user-2', role: 'member' })).user_id).toBe('user-2');
    expect((await removeProjectMembership({ projectId: 'project-1', membershipId: 'membership-2' }))?.id).toBe('membership-2');
  });

  it('looks up users by email', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'user-1', firebase_uid: 'firebase-1', email: 'user@example.com', display_name: 'User' }],
      rowCount: 1,
    });

    expect((await getUserByEmail('user@example.com'))?.firebase_uid).toBe('firebase-1');
  });

  it('creates, lists, and revokes project invitations', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'invite-1', project_id: 'project-1', email: 'new@example.com', role: 'member', invited_by_user_id: 'user-1', status: 'pending' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'invite-1', project_id: 'project-1', email: 'new@example.com', role: 'member', invited_by_user_id: 'user-1', status: 'pending' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'invite-1', project_id: 'project-1', email: 'new@example.com', role: 'member', invited_by_user_id: 'user-1', status: 'revoked' }],
        rowCount: 1,
      });

    expect((await createProjectInvitation({
      projectId: 'project-1',
      email: 'new@example.com',
      role: 'member',
      invitedByUserId: 'user-1',
    })).status).toBe('pending');
    expect(await listProjectInvitations('project-1')).toHaveLength(1);
    expect((await revokeProjectInvitation({ projectId: 'project-1', invitationId: 'invite-1' }))?.status).toBe('revoked');
  });

  it('lists and updates project mind configs', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'mind-1', project_id: 'project-1', agent_id: 'librarian', display_name: 'Librarian', icon: '📚', blurb: 'Guide', enabled: true, prompt_override: null }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'mind-1', project_id: 'project-1', agent_id: 'librarian', display_name: 'Librarian', icon: '📚', blurb: 'Guide', enabled: true, prompt_override: null }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'mind-1', project_id: 'project-1', agent_id: 'librarian', display_name: 'Archivist', icon: '📚', blurb: 'Guide', enabled: true, prompt_override: null }],
        rowCount: 1,
      });

    expect(await listProjectMindConfigs('project-1')).toHaveLength(1);
    expect((await getProjectMindConfigById({ projectId: 'project-1', mindId: 'mind-1' }))?.agent_id).toBe('librarian');
    expect((await updateProjectMindConfig({
      projectId: 'project-1',
      mindId: 'mind-1',
      displayName: 'Archivist',
    }))?.display_name).toBe('Archivist');
  });

  it('seeds default project mind configs', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'mind-1', project_id: 'project-1', agent_id: 'project-agent', display_name: 'Project Agent', icon: '🤖', blurb: 'Default project execution assistant', enabled: true, prompt_override: null },
      ],
      rowCount: 1,
    });

    expect(await seedProjectMindConfigs('project-1')).toHaveLength(1);
    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(sql).toContain('insert into project_mind_configs');
    expect(params).toContain('project-1');
  });
});
