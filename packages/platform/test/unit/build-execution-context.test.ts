// ABOUTME: Unit coverage for shared Mastra RequestContext construction.
// ABOUTME: Verifies happy-path seeding and runtime validation for missing or empty fields.

import { describe, expect, it } from 'vitest';

import { buildExecutionContext } from '../../src/mastra/execution/build-execution-context';
import type { ExecutionContextInput } from '../../src/mastra/execution/build-execution-context';

function createValidInput(): ExecutionContextInput {
  return {
    projectContext: {
      actorUserId: 'user-1',
      organizationId: 'org-1',
      projectId: 'project-1',
      role: 'owner',
      resourceId: 'project:project-1',
    },
    mindspaceRootPath: '/tmp/workspaces/project-1',
    workspace: { filesystem: {} } as never,
    resourceId: 'channel:channel-1',
    threadId: 'thread-1',
    channelId: 'channel-1',
    currentThreadId: 'thread-1',
  };
}

describe('buildExecutionContext — happy path', () => {
  it('seeds project, workspace, channel, and Mastra memory context values', () => {
    const input = createValidInput();
    const workspaceRef = input.workspace;

    const execution = buildExecutionContext(input);

    expect(execution.resourceId).toBe('channel:channel-1');
    expect(execution.threadId).toBe('thread-1');
    expect(execution.mindspaceRootPath).toBe('/tmp/workspaces/project-1');
    expect(execution.requestContext.get('resourceId')).toBe('project:project-1');
    expect(execution.requestContext.get('actorUserId')).toBe('user-1');
    expect(execution.requestContext.get('organizationId')).toBe('org-1');
    expect(execution.requestContext.get('projectId')).toBe('project-1');
    expect(execution.requestContext.get('role')).toBe('owner');
    expect(execution.requestContext.get('workspace')).toBe(workspaceRef);
    expect(execution.requestContext.get('channelId')).toBe('channel-1');
    expect(execution.requestContext.get('currentThreadId')).toBe('thread-1');
    expect(execution.requestContext.get('mastra__resourceId')).toBe('channel:channel-1');
    expect(execution.requestContext.get('mastra__threadId')).toBe('thread-1');
  });

  it('accepts omitted channelId and currentThreadId for non-channel flows', () => {
    const input = createValidInput();
    delete input.channelId;
    delete input.currentThreadId;

    const execution = buildExecutionContext(input);

    expect(execution.requestContext.get('channelId')).toBeUndefined();
    expect(execution.requestContext.get('currentThreadId')).toBeUndefined();
    expect(execution.requestContext.get('projectId')).toBe('project-1');
  });
});

describe('buildExecutionContext — validation', () => {
  const requiredProjectContextFields: Array<keyof ExecutionContextInput['projectContext']> = [
    'actorUserId',
    'organizationId',
    'projectId',
    'role',
    'resourceId',
  ];

  for (const field of requiredProjectContextFields) {
    it(`throws when projectContext.${field} is empty`, () => {
      const input = createValidInput();
      input.projectContext = { ...input.projectContext, [field]: '' };
      expect(() => buildExecutionContext(input)).toThrow(new RegExp(`projectContext\\.${field}`));
    });
  }

  const requiredTopLevelStringFields: Array<'mindspaceRootPath' | 'resourceId' | 'threadId'> = [
    'mindspaceRootPath',
    'resourceId',
    'threadId',
  ];

  for (const field of requiredTopLevelStringFields) {
    it(`throws when ${field} is empty`, () => {
      const input = createValidInput();
      input[field] = '';
      expect(() => buildExecutionContext(input)).toThrow(new RegExp(field));
    });
  }

  it('throws when workspace is null', () => {
    const input = createValidInput();
    (input as { workspace: unknown }).workspace = null;
    expect(() => buildExecutionContext(input)).toThrow(/workspace/);
  });

  it('throws when channelId is provided but empty (positive-presence violation)', () => {
    const input = createValidInput();
    input.channelId = '';
    expect(() => buildExecutionContext(input)).toThrow(/channelId/);
  });

  it('throws when currentThreadId is provided but empty', () => {
    const input = createValidInput();
    input.currentThreadId = '';
    expect(() => buildExecutionContext(input)).toThrow(/currentThreadId/);
  });

  it('includes the offending field name in the error message for easy debugging', () => {
    const input = createValidInput();
    input.projectContext = { ...input.projectContext, projectId: '' };
    try {
      buildExecutionContext(input);
      throw new Error('expected buildExecutionContext to throw');
    } catch (error) {
      expect((error as Error).message).toContain('projectContext.projectId');
    }
  });
});
