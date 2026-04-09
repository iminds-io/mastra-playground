import { describe, expect, it } from 'vitest';

import { buildWorkspaceRootPath, ensureContainedWorkspacePath } from '../../src/workspace/paths';

describe('buildWorkspaceRootPath', () => {
  it('builds a contained workspace path', () => {
    const result = buildWorkspaceRootPath('/tmp/workspaces', 'org-1', 'project-1');

    expect(result).toContain('/tmp/workspaces');
    expect(result).toContain('org_org-1');
    expect(result).toContain('project_project-1');
  });

  it('rejects paths that escape the configured root', () => {
    expect(() => ensureContainedWorkspacePath('/tmp/workspaces', '/etc/passwd')).toThrow(/contained/i);
  });
});
