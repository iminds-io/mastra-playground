import { loadProjectContext } from '../../services/project-context';
import type { WorkspaceFactory } from '../../platform-deps';
import { resolveWorkspaceForProject } from '../../workspace/resolver';
import { buildExecutionContext } from './build-execution-context';

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
  mastra: {
    getAgent(name: 'projectAgent'): ProjectAgentLike;
  };
  workspaceFactory: WorkspaceFactory;
};

export async function executeProjectAgent(input: {
  firebaseUid: string;
  projectId: string;
  message: string;
}, deps: ExecuteProjectAgentDeps) {
  const projectContext = await loadProjectContext({
    firebaseUid: input.firebaseUid,
    projectId: input.projectId,
  });
  const resolvedWorkspace = await resolveWorkspaceForProject(input.projectId, {
    workspaceFactory: deps.workspaceFactory,
  });
  const threadId = projectContext.projectId;
  const execution = buildExecutionContext({
    projectContext,
    workspaceRootPath: resolvedWorkspace.root.root_path,
    workspace: resolvedWorkspace.workspace,
    resourceId: projectContext.resourceId,
    threadId,
  });

  const agent = deps.mastra.getAgent('projectAgent');
  const output = await agent.generate(input.message, {
    requestContext: execution.requestContext,
    resourceId: projectContext.resourceId,
    threadId,
  });

  return {
    resourceId: projectContext.resourceId,
    workspaceRootPath: execution.workspaceRootPath,
    threadId,
    runId: output.runId,
    modelId: output.response?.modelId,
    text: output.text,
  };
}
