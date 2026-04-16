import { RequestContext } from '@mastra/core/request-context';

import { loadProjectContext } from '../../services/project-context';
import { getWorkspaceFactory } from '../../workspace/workspace-context';
import { resolveWorkspaceForProject } from '../../workspace/resolver';
import { createProjectAgent } from '../agents/project-agent';
import type { ProjectAgentRequestContext } from './request-context';

type ProjectAgentResponse = {
  text: string;
  runId?: string | undefined;
  response?: {
    modelId?: string | undefined;
  } | undefined;
};

type ProjectAgentLike = {
  generate(message: string, options: unknown): Promise<ProjectAgentResponse>;
};

type ExecuteProjectAgentDeps = {
  mastra?: {
    getAgent(name: 'projectAgent'): ProjectAgentLike;
  };
  createRuntimeWorkspace?: (basePath: string) => Promise<import('@mastra/core/workspace').Workspace>;
};

export async function executeProjectAgent(input: {
  firebaseUid: string;
  projectId: string;
  message: string;
}, deps: ExecuteProjectAgentDeps = {}) {
  const projectContext = await loadProjectContext({
    firebaseUid: input.firebaseUid,
    projectId: input.projectId,
  });
  const resolvedWorkspace = await resolveWorkspaceForProject(input.projectId);
  const runtimeWorkspace = await (deps.createRuntimeWorkspace ?? getWorkspaceFactory())(
    resolvedWorkspace.root.root_path,
  );
  const threadId = projectContext.projectId;
  const requestContext = new RequestContext<ProjectAgentRequestContext>();

  requestContext.set('resourceId', projectContext.resourceId);
  requestContext.set('actorUserId', projectContext.actorUserId);
  requestContext.set('organizationId', projectContext.organizationId);
  requestContext.set('projectId', projectContext.projectId);
  requestContext.set('role', projectContext.role);
  requestContext.set('workspace', runtimeWorkspace);
  requestContext.set('mastra__resourceId', projectContext.resourceId);
  requestContext.set('mastra__threadId', threadId);

  const agent = deps.mastra?.getAgent('projectAgent') ?? createProjectAgent();
  const output = await agent.generate(input.message, {
    requestContext,
    resourceId: projectContext.resourceId,
    threadId,
  });

  return {
    resourceId: projectContext.resourceId,
    workspaceRootPath: resolvedWorkspace.root.root_path,
    threadId,
    runId: output.runId,
    modelId: output.response?.modelId,
    text: output.text,
  };
}
