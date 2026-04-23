// ABOUTME: Type contract for the RequestContext that flows through every workspace-aware agent.
// ABOUTME: Composed from three logical groups — caller identity, project domain, Mastra framework keys.

import type { Workspace } from '@mastra/core/workspace';

import type { ProjectContext } from '../../services/project-context';

/**
 * Mastra framework-owned keys. The double-underscore prefix is a Mastra
 * convention — these feed its memory + storage subsystem and should not be
 * reused for application concerns.
 */
export type MastraFrameworkContext = {
  mastra__resourceId: string;
  mastra__threadId: string;
};

/**
 * Domain fields describing *what* the agent is currently acting on. Channel
 * and thread IDs are present only on channel-scoped flows (chat message
 * streaming); they are absent on project-level admin invocations.
 */
export type ProjectDomainContext = {
  workspace: Workspace;
  channelId?: string;
  currentThreadId?: string;
};

/**
 * Full contract seen by agent instructions, tools, and workflow steps.
 * Caller identity (actorUserId, organizationId, projectId, role, resourceId)
 * is inherited from {@link ProjectContext} so services/project-context.ts
 * stays the single source of truth for those fields.
 */
export type ProjectAgentRequestContext =
  & ProjectContext
  & ProjectDomainContext
  & MastraFrameworkContext;
