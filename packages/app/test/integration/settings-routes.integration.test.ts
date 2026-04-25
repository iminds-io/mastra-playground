import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/server/factory';

const verifiedPrincipal = {
  uid: 'firebase-user-1',
  email: 'user@example.com',
  emailVerified: true,
  name: 'Demo User',
  picture: null,
  authTime: 123,
  rawClaims: {},
};

describe('settings routes', () => {
  it('gets and updates general project settings', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      getProjectSettingsGeneral: async () => ({
        role: 'owner',
        project: {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Alpha',
          slug: 'alpha',
          status: 'active',
          createdAt: '2026-04-24T00:00:00.000Z',
        },
      }),
      updateProjectSettingsGeneral: async () => ({
        project: {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Renamed',
          slug: 'alpha',
          status: 'active',
        },
      }),
    });

    const getResponse = await app.request('/api/projects/project-1/settings/general', {
      headers: {
        authorization: 'Bearer demo-token',
      },
    });

    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual({
      role: 'owner',
      project: {
        id: 'project-1',
        organizationId: 'org-1',
        name: 'Alpha',
        slug: 'alpha',
        status: 'active',
        createdAt: '2026-04-24T00:00:00.000Z',
      },
    });

    const patchResponse = await app.request('/api/projects/project-1/settings/general', {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Renamed' }),
    });

    expect(patchResponse.status).toBe(200);
    expect(await patchResponse.json()).toEqual({
      project: {
        id: 'project-1',
        organizationId: 'org-1',
        name: 'Renamed',
        slug: 'alpha',
        status: 'active',
      },
    });
  });

  it('lists and invites project members', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      listProjectSettingsMembers: async () => ({
        role: 'owner',
        members: [
          {
            membershipId: 'membership-1',
            userId: 'user-1',
            role: 'owner',
            displayName: 'Demo User',
            email: 'user@example.com',
          },
        ],
        invitations: [
          {
            id: 'invite-1',
            email: 'new@example.com',
            role: 'member',
            status: 'pending',
          },
        ],
      }),
      inviteProjectMember: async () => ({
        invitation: {
          id: 'invite-2',
          project_id: 'project-1',
          email: 'known@example.com',
          role: 'member',
          invited_by_user_id: 'user-1',
          status: 'pending',
        },
        membership: {
          id: 'membership-2',
          project_id: 'project-1',
          user_id: 'user-2',
          role: 'member',
        },
      }),
      removeProjectMember: async () => ({
        membership: {
          id: 'membership-2',
          project_id: 'project-1',
          user_id: 'user-2',
          role: 'member',
        },
      }),
    });

    const listResponse = await app.request('/api/projects/project-1/settings/members', {
      headers: {
        authorization: 'Bearer demo-token',
      },
    });
    expect(listResponse.status).toBe(200);

    const inviteResponse = await app.request('/api/projects/project-1/settings/members/invite', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: 'known@example.com', role: 'member' }),
    });
    expect(inviteResponse.status).toBe(200);

    const deleteResponse = await app.request('/api/projects/project-1/settings/members/membership-2', {
      method: 'DELETE',
      headers: {
        authorization: 'Bearer demo-token',
      },
    });
    expect(deleteResponse.status).toBe(200);
  });

  it('lists and updates project minds', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      listProjectMindConfigs: async () => ({
        role: 'owner',
        minds: [
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
        ],
      }),
      updateProjectMindConfig: async () => ({
        mind: {
          id: 'mind-1',
          project_id: 'project-1',
          agent_id: 'librarian',
          display_name: 'Archivist',
          icon: '📚',
          blurb: 'Guide',
          enabled: true,
          prompt_override: null,
        },
      }),
    });

    const listResponse = await app.request('/api/projects/project-1/settings/minds', {
      headers: {
        authorization: 'Bearer demo-token',
      },
    });
    expect(listResponse.status).toBe(200);

    const patchResponse = await app.request('/api/projects/project-1/settings/minds/mind-1', {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ displayName: 'Archivist' }),
    });
    expect(patchResponse.status).toBe(200);
  });

  it('archives a project via the archive settings route', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      archiveProjectSettings: async () => ({
        project: {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Alpha',
          slug: 'alpha',
          status: 'archived',
        },
      }),
    });

    const response = await app.request('/api/projects/project-1/settings/archive', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      project: {
        id: 'project-1',
        organizationId: 'org-1',
        name: 'Alpha',
        slug: 'alpha',
        status: 'archived',
      },
    });
  });
});
