// ABOUTME: Project-scoped Tier B surface for the mindspace supervisor agent.
// ABOUTME: Handles authorization, workspace resolution, context seeding, and response shaping.

import { buildExecutionContext } from '../mastra/execution/build-execution-context';
import { getAgentWithVersion, type AgentVersionOpts } from '../mastra/version';
import type { PlatformDeps } from '../platform-deps';
import { resolveMindspaceForProject } from '../mindspace/resolver';
import { AccessDeniedError } from './access-control';
import { loadProjectContext } from './project-context';

export type MindspaceSupervisorInput = {
  firebaseUid: string;
  projectId: string;
  prompt: string;
  paths?: string[];
};

export type MindspaceSupervisorResult = {
  projectId: string;
  text: string;
  runId?: string;
  modelId?: string;
};

function deriveResourceId(projectId: string) {
  return `harness:mindspace-supervisor:project:${projectId}`;
}

function deriveThreadId() {
  return `mindspace-supervisor:${Date.now()}`;
}

function renderPrompt(input: MindspaceSupervisorInput) {
  const prompt = input.prompt.trim();
  const paths = input.paths?.filter((path) => path.trim().length > 0) ?? [];

  return [
    prompt,
    ...(paths.length > 0
      ? ['', 'Relevant mindspace paths:', ...paths.map((path) => `- ${path}`)]
      : []),
  ].join('\n');
}

export async function runMindspaceSupervisorForPrincipal(
  input: MindspaceSupervisorInput,
  deps: PlatformDeps & { version?: AgentVersionOpts },
): Promise<MindspaceSupervisorResult> {
  if (input.prompt.trim().length === 0) {
    throw new AccessDeniedError('Prompt is required');
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

  const agent = await getAgentWithVersion(deps.mastra, 'mindspace-supervisor', deps.version);
  const output = await agent.generate(renderPrompt(input), {
    requestContext: execution.requestContext,
    memory: { thread: execution.threadId, resource: execution.resourceId },
    maxSteps: 8,
    delegation: {
      messageFilter: ({ messages }) => messages.slice(-12),
    },
  });

  return {
    projectId: input.projectId,
    text: output.text,
    ...(output.runId ? { runId: output.runId } : {}),
    ...(output.response?.modelId ? { modelId: output.response.modelId } : {}),
  };
}
