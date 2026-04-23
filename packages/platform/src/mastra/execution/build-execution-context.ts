// ABOUTME: Builds a Mastra RequestContext seeded with project, principal, and workspace info.
// ABOUTME: Validates required fields at construction so downstream tools see a coherent context or a clear error.

import { RequestContext } from '@mastra/core/request-context';
import type { Workspace } from '@mastra/core/workspace';

import type { ProjectContext } from '../../services/project-context';
import type { ProjectAgentRequestContext } from './request-context';

export type ExecutionContextInput = {
  projectContext: ProjectContext;
  workspaceRootPath: string;
  workspace: Workspace;
  resourceId: string;
  threadId: string;
  channelId?: string;
  currentThreadId?: string;
};

export type ExecutionContext = {
  requestContext: RequestContext<ProjectAgentRequestContext>;
  resourceId: string;
  threadId: string;
  workspaceRootPath: string;
};

function requireNonEmpty(label: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`buildExecutionContext: ${label} is required and must be a non-empty string.`);
  }
}

function requireOptionalNonEmpty(label: string, value: unknown) {
  if (value === undefined) return;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`buildExecutionContext: ${label} was provided but is empty. Omit it instead of passing an empty string.`);
  }
}

function requireWorkspace(value: unknown): asserts value is Workspace {
  if (value === null || value === undefined) {
    throw new Error('buildExecutionContext: workspace is required and must be a Workspace instance.');
  }
}

export function buildExecutionContext(input: ExecutionContextInput): ExecutionContext {
  requireNonEmpty('projectContext.actorUserId', input.projectContext?.actorUserId);
  requireNonEmpty('projectContext.organizationId', input.projectContext?.organizationId);
  requireNonEmpty('projectContext.projectId', input.projectContext?.projectId);
  requireNonEmpty('projectContext.role', input.projectContext?.role);
  requireNonEmpty('projectContext.resourceId', input.projectContext?.resourceId);
  requireNonEmpty('workspaceRootPath', input.workspaceRootPath);
  requireNonEmpty('resourceId', input.resourceId);
  requireNonEmpty('threadId', input.threadId);
  requireWorkspace(input.workspace);
  requireOptionalNonEmpty('channelId', input.channelId);
  requireOptionalNonEmpty('currentThreadId', input.currentThreadId);

  const requestContext = new RequestContext<ProjectAgentRequestContext>();

  requestContext.set('resourceId', input.projectContext.resourceId);
  requestContext.set('actorUserId', input.projectContext.actorUserId);
  requestContext.set('organizationId', input.projectContext.organizationId);
  requestContext.set('projectId', input.projectContext.projectId);
  requestContext.set('role', input.projectContext.role);
  requestContext.set('workspace', input.workspace);
  if (input.channelId) requestContext.set('channelId', input.channelId);
  if (input.currentThreadId) requestContext.set('currentThreadId', input.currentThreadId);
  requestContext.set('mastra__resourceId', input.resourceId);
  requestContext.set('mastra__threadId', input.threadId);

  return {
    requestContext,
    resourceId: input.resourceId,
    threadId: input.threadId,
    workspaceRootPath: input.workspaceRootPath,
  };
}
