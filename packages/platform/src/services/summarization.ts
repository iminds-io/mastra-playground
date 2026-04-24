// ABOUTME: Project-scoped summarization surface wrapping the summarizer agent.
// ABOUTME: Handles project authorization, workspace resolution, and response shaping.

import { buildExecutionContext } from '../mastra/execution/build-execution-context';
import { getAgentWithVersion, type AgentVersionOpts } from '../mastra/version';
import type { PlatformDeps } from '../platform-deps';
import { resolveMindspaceForProject } from '../mindspace/resolver';
import { AccessDeniedError } from './access-control';
import { loadProjectContext } from './project-context';

export type SummarizeInput = {
  firebaseUid: string;
  projectId: string;
  paths: string[];
  question?: string;
};

export type SummarizeResult = {
  projectId: string;
  paths: string[];
  text: string;
  runId?: string;
  modelId?: string;
};

function deriveResourceId(projectId: string) {
  return `harness:summarizer:project:${projectId}`;
}

function deriveThreadId() {
  return `summarize:${Date.now()}`;
}

function renderPrompt(input: SummarizeInput): string {
  const lines = [
    'Summarize the following mindspace documents:',
    ...input.paths.map((path) => `- ${path}`),
  ];

  if (input.question) {
    lines.push('', `Question to answer in the summary: ${input.question}`);
  }

  return lines.join('\n');
}

export async function summarizeProjectDocsForPrincipal(
  input: SummarizeInput,
  deps: PlatformDeps & { version?: AgentVersionOpts },
): Promise<SummarizeResult> {
  if (input.paths.length === 0) {
    throw new AccessDeniedError('At least one path is required');
  }

  const projectContext = await loadProjectContext({
    firebaseUid: input.firebaseUid,
    projectId: input.projectId,
  });
  const resolved = await resolveMindspaceForProject(input.projectId, {
    mindspaceFactory: deps.mindspaceFactory,
  });
  const execution = buildExecutionContext({
    projectContext,
    mindspaceRootPath: resolved.root.root_path,
    workspace: resolved.workspace,
    resourceId: deriveResourceId(input.projectId),
    threadId: deriveThreadId(),
  });

  const agent = await getAgentWithVersion(deps.mastra, 'summarizer', deps.version);
  const output = await agent.generate(renderPrompt(input), {
    requestContext: execution.requestContext,
    memory: { thread: execution.threadId, resource: execution.resourceId },
  });

  return {
    projectId: input.projectId,
    paths: input.paths,
    text: output.text,
    ...(output.runId ? { runId: output.runId } : {}),
    ...(output.response?.modelId ? { modelId: output.response.modelId } : {}),
  };
}
