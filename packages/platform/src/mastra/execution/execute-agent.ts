import { loadProjectContext } from '../../services/project-context';
import type { MindspaceFactory } from '../../platform-deps';
import { resolveMindspaceForProject } from '../../mindspace/resolver';
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
  mindspaceFactory: MindspaceFactory;
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
  const resolvedWorkspace = await resolveMindspaceForProject(input.projectId, {
    mindspaceFactory: deps.mindspaceFactory,
  });
  const threadId = projectContext.projectId;
  const execution = buildExecutionContext({
    projectContext,
    mindspaceRootPath: resolvedWorkspace.root.root_path,
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
    mindspaceRootPath: execution.mindspaceRootPath,
    threadId,
    runId: output.runId,
    modelId: output.response?.modelId,
    text: output.text,
  };
}
