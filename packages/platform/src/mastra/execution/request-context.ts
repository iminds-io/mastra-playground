import type { createRuntimeWorkspace } from '../../workspace/factory';

export type ProjectExecutionContext = {
  resourceId: string;
  actorUserId: string;
  organizationId: string;
  projectId: string;
  role: string;
};

export type ProjectAgentRequestContext = ProjectExecutionContext & {
  workspace: Awaited<ReturnType<typeof createRuntimeWorkspace>>;
  channelId?: string;
  currentThreadId?: string;
  mastra__resourceId: string;
  mastra__threadId: string;
};
