import { describe, expect, it } from 'vitest';

import { buildMindspaceRootPath, ensureContainedMindspacePath } from '../../src/mindspace/paths';

describe('buildMindspaceRootPath', () => {
  it('builds a contained workspace path', () => {
    const result = buildMindspaceRootPath('/tmp/workspaces', 'org-1', 'project-1');

    expect(result).toContain('/tmp/workspaces');
    expect(result).toContain('org_org-1');
    expect(result).toContain('project_project-1');
  });

  it('rejects paths that escape the configured root', () => {
    expect(() => ensureContainedMindspacePath('/tmp/workspaces', '/etc/passwd')).toThrow(/contained/i);
  });
});
