import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/db/repositories/workspace-bindings', () => ({
  getActiveWorkspaceBinding: vi.fn(async () => ({
    id: 'binding-1',
    project_id: 'project-1',
    workspace_root_id: 'root-1',
    active_agent_ref: 'default',
    active_agent_version: 'v1',
    created_at: new Date('2026-04-17T00:00:00.000Z'),
    updated_at: new Date('2026-04-17T00:00:00.000Z'),
  })),
}));

vi.mock('../../src/db/repositories/workspace-roots', () => ({
  getActiveWorkspaceRootByProjectId: vi.fn(async () => ({
    id: 'root-1',
    organization_id: 'org-1',
    project_id: 'project-1',
    root_path: '/tmp/workspaces/project-1',
    status: 'ready',
    created_at: new Date('2026-04-17T00:00:00.000Z'),
    updated_at: new Date('2026-04-17T00:00:00.000Z'),
  })),
}));

import { resolveWorkspaceForProject } from '../../src/workspace/resolver';

describe('resolveWorkspaceForProject', () => {
  it('constructs the workspace with the supplied factory exactly once', async () => {
    const workspace = { filesystem: {} };
    const workspaceFactory = vi.fn(async () => workspace as never);

    const resolved = await resolveWorkspaceForProject('project-1', { workspaceFactory });

    expect(workspaceFactory).toHaveBeenCalledTimes(1);
    expect(workspaceFactory).toHaveBeenCalledWith('/tmp/workspaces/project-1');
    expect(resolved.workspace).toBe(workspace);
  });

  it('requires a workspace factory dependency', async () => {
    await expect(resolveWorkspaceForProject('project-1', {} as never)).rejects.toThrow(
      'resolveWorkspaceForProject: workspaceFactory is required.',
    );
  });
});
