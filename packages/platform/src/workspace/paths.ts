import { relative, resolve } from 'node:path';

export function buildWorkspaceRootPath(baseRoot: string, organizationId: string, projectId: string): string {
  return resolve(baseRoot, `org_${organizationId}`, `project_${projectId}`);
}

export function ensureContainedWorkspacePath(baseRoot: string, candidatePath: string): string {
  const absoluteBaseRoot = resolve(baseRoot);
  const absoluteCandidate = resolve(candidatePath);
  const pathRelativeToBase = relative(absoluteBaseRoot, absoluteCandidate);

  if (pathRelativeToBase.startsWith('..') || pathRelativeToBase === '') {
    throw new Error('Workspace path must remain contained within the configured root');
  }

  return absoluteCandidate;
}
