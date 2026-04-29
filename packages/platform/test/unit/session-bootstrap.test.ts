import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListAccessibleProjectsForPrincipal = vi.fn();
const mockCanAccessAdminConsole = vi.fn();

vi.mock('../../src/services/projects', () => ({
  listAccessibleProjectsForPrincipal: (...args: unknown[]) =>
    mockListAccessibleProjectsForPrincipal(...args),
}));

vi.mock('../../src/services/admin-access', () => ({
  canAccessAdminConsole: (...args: unknown[]) => mockCanAccessAdminConsole(...args),
}));

import { getSessionBootstrapForPrincipal } from '../../src/services/session-bootstrap';

describe('session bootstrap service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAccessAdminConsole.mockReturnValue(false);
  });

  it('returns null preferredProjectId when the principal has no accessible projects', async () => {
    mockListAccessibleProjectsForPrincipal.mockResolvedValue({
      projects: [],
    });

    const result = await getSessionBootstrapForPrincipal({
      uid: 'firebase-1',
      email: 'user@example.com',
      name: 'Demo User',
    });

    expect(result).toEqual({
      me: {
        uid: 'firebase-1',
        email: 'user@example.com',
        name: 'Demo User',
      },
      capabilities: {
        canAccessAdminConsole: false,
      },
      projects: [],
      preferredProjectId: null,
    });
  });

  it('uses the first accessible project as the preferred project id', async () => {
    mockListAccessibleProjectsForPrincipal.mockResolvedValue({
      projects: [
        {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Alpha',
          slug: 'alpha',
          status: 'active',
        },
        {
          id: 'project-2',
          organizationId: 'org-1',
          name: 'Beta',
          slug: 'beta',
          status: 'active',
        },
      ],
    });
    mockCanAccessAdminConsole.mockReturnValue(true);

    const result = await getSessionBootstrapForPrincipal({
      uid: 'firebase-1',
      email: 'user@example.com',
      name: 'Demo User',
      adminEmails: [' user@example.com '],
    });

    expect(mockListAccessibleProjectsForPrincipal).toHaveBeenCalledWith({
      firebaseUid: 'firebase-1',
    });
    expect(mockCanAccessAdminConsole).toHaveBeenCalledWith({
      email: 'user@example.com',
      adminEmails: [' user@example.com '],
    });
    expect(result.preferredProjectId).toBe('project-1');
    expect(result.projects).toHaveLength(2);
    expect(result.capabilities.canAccessAdminConsole).toBe(true);
  });
});
