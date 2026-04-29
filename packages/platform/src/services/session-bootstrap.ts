import { listAccessibleProjectsForPrincipal, type AccessibleProjectSummary } from './projects';
import { canAccessAdminConsole } from './admin-access';

export type SessionBootstrapResult = {
  me: {
    uid: string;
    email: string | null;
    name: string | null;
  };
  capabilities: {
    canAccessAdminConsole: boolean;
  };
  projects: AccessibleProjectSummary[];
  preferredProjectId: string | null;
};

export async function getSessionBootstrapForPrincipal(input: {
  uid: string;
  email: string | null;
  name: string | null;
  adminEmails?: string[] | string;
}): Promise<SessionBootstrapResult> {
  const { projects } = await listAccessibleProjectsForPrincipal({
    firebaseUid: input.uid,
  });

  return {
    me: {
      uid: input.uid,
      email: input.email,
      name: input.name,
    },
    capabilities: {
      canAccessAdminConsole: canAccessAdminConsole({
        email: input.email,
        adminEmails: input.adminEmails,
      }),
    },
    projects,
    preferredProjectId: projects[0]?.id ?? null,
  };
}
