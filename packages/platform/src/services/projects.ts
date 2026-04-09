import { listProjectsForFirebaseUid } from '../db/repositories/projects';

export type AccessibleProjectSummary = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: string;
};

export async function listAccessibleProjectsForPrincipal(input: { firebaseUid: string }): Promise<{
  projects: AccessibleProjectSummary[];
}> {
  const projects = await listProjectsForFirebaseUid(input.firebaseUid);

  return {
    projects: projects.map((project) => ({
      id: project.id,
      organizationId: project.organization_id,
      name: project.name,
      slug: project.slug,
      status: project.status,
    })),
  };
}
