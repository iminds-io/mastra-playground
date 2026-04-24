import { relative, resolve } from 'node:path';

export function buildMindspaceRootPath(baseRoot: string, organizationId: string, projectId: string): string {
  return resolve(baseRoot, `org_${organizationId}`, `project_${projectId}`);
}

export function ensureContainedMindspacePath(baseRoot: string, candidatePath: string): string {
  const absoluteBaseRoot = resolve(baseRoot);
  const absoluteCandidate = resolve(candidatePath);
  const pathRelativeToBase = relative(absoluteBaseRoot, absoluteCandidate);

  if (pathRelativeToBase.startsWith('..') || pathRelativeToBase === '') {
    throw new Error('Mindspace path must remain contained within the configured root');
  }

  return absoluteCandidate;
}
