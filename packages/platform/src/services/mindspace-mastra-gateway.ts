// ABOUTME: Mindspace-scoped gateway over Mastra agents and workflows.
// ABOUTME: Injects project auth, workspace context, memory scope, and primitive policy before SDK calls.

import type { AgentVersionOpts } from '../mastra/version';
import { buildExecutionContext } from '../mastra/execution/build-execution-context';
import { getAgentWithVersion } from '../mastra/version';
import {
  mindspaceMastraAgentMetadata,
  mindspaceMastraWorkflowMetadata,
  type MindspaceMastraOperation,
} from '../mastra/registry-metadata';
import type { PlatformDeps } from '../platform-deps';
import { resolveMindspaceForProject } from '../mindspace/resolver';
import { AccessDeniedError } from './access-control';
import { loadProjectContext } from './project-context';

export type MindspaceMastraGatewayDeps = PlatformDeps;
export type MindspaceMastraPrimitiveKind = 'agent' | 'workflow';

export type MindspaceMastraListItem = {
  id: string;
  capability: 'read' | 'write';
  operations: MindspaceMastraOperation[];
};

export type MindspaceMastraStreamEvent = {
  event: string;
  data: Record<string, unknown>;
};

export type MindspaceMastraVersionDeps = {
  version?: AgentVersionOpts;
};

type ProjectRole = string;

export type GenerateMindspaceMastraAgentInput = {
  firebaseUid: string;
  projectId: string;
  agentId: string;
  messages: string;
  threadId?: string;
};

export type StartMindspaceMastraWorkflowInput = {
  firebaseUid: string;
  projectId: string;
  workflowId: string;
  runId?: string;
  inputData?: unknown;
  threadId?: string;
};

export function listAllowedMindspaceAgents(input: { role: ProjectRole }): MindspaceMastraListItem[] {
  return Object.values(mindspaceMastraAgentMetadata)
    .filter((metadata) => metadata.exposed)
    .filter((metadata) => isRoleAllowed(input.role, getMinRole(metadata)))
    .map(({ id, capability, operations }) => ({ id, capability, operations: [...operations] }));
}

export function listAllowedMindspaceWorkflows(input: { role: ProjectRole }): MindspaceMastraListItem[] {
  return Object.values(mindspaceMastraWorkflowMetadata)
    .filter((metadata) => metadata.exposed)
    .filter((metadata) => isRoleAllowed(input.role, getMinRole(metadata)))
    .map(({ id, capability, operations }) => ({ id, capability, operations: [...operations] }));
}

export function deriveMindspaceMastraResourceId(input: {
  projectId: string;
  primitiveKind: MindspaceMastraPrimitiveKind;
  primitiveId: string;
}) {
  return `mindspace-mastra:${input.primitiveKind}:${input.primitiveId}:project:${input.projectId}`;
}

export function deriveMindspaceMastraThreadId(input: {
  primitiveKind: MindspaceMastraPrimitiveKind;
  primitiveId: string;
  suppliedThreadId?: string;
}) {
  const supplied = input.suppliedThreadId?.trim();
  if (supplied) return supplied;
  return `mindspace-mastra:${input.primitiveKind}:${input.primitiveId}:${Date.now()}`;
}

export async function listMindspaceMastraAgentsForPrincipal(
  input: { firebaseUid: string; projectId: string },
  deps: MindspaceMastraGatewayDeps,
) {
  const projectContext = await loadProjectContext(input);
  const available = deps.mastra.listAgents() as Record<string, unknown>;
  const agents = listAllowedMindspaceAgents({ role: projectContext.role })
    .filter((agent) => agent.id in available);

  return {
    projectId: projectContext.projectId,
    agents,
  };
}

export async function generateMindspaceMastraAgentForPrincipal(
  input: GenerateMindspaceMastraAgentInput,
  deps: MindspaceMastraGatewayDeps & MindspaceMastraVersionDeps,
) {
  const messages = input.messages.trim();
  if (!messages) throw new AccessDeniedError('messages is required');
  assertAgentOperationAllowed(input.agentId, 'generate');

  const execution = await buildGatewayExecution({
    firebaseUid: input.firebaseUid,
    projectId: input.projectId,
    primitiveKind: 'agent',
    primitiveId: input.agentId,
    ...(input.threadId ? { suppliedThreadId: input.threadId } : {}),
  }, deps);
  const agent = await getAgentWithVersion(deps.mastra, input.agentId, deps.version);
  const output = await agent.generate(messages, {
    requestContext: execution.requestContext,
    memory: {
      thread: execution.threadId,
      resource: execution.resourceId,
    },
  });

  return {
    projectId: execution.projectId,
    agentId: input.agentId,
    threadId: execution.threadId,
    resourceId: execution.resourceId,
    text: output.text,
    ...(output.runId ? { runId: output.runId } : {}),
    ...(output.response?.modelId ? { modelId: output.response.modelId } : {}),
  };
}

export async function* streamMindspaceMastraAgentForPrincipal(
  input: GenerateMindspaceMastraAgentInput,
  deps: MindspaceMastraGatewayDeps & MindspaceMastraVersionDeps,
): AsyncGenerator<MindspaceMastraStreamEvent> {
  const messages = input.messages.trim();
  if (!messages) throw new AccessDeniedError('messages is required');
  assertAgentOperationAllowed(input.agentId, 'stream');

  const execution = await buildGatewayExecution({
    firebaseUid: input.firebaseUid,
    projectId: input.projectId,
    primitiveKind: 'agent',
    primitiveId: input.agentId,
    ...(input.threadId ? { suppliedThreadId: input.threadId } : {}),
  }, deps);
  const agent = await getAgentWithVersion(deps.mastra, input.agentId, deps.version);
  const stream = await agent.stream(messages, {
    requestContext: execution.requestContext,
    memory: {
      thread: execution.threadId,
      resource: execution.resourceId,
    },
  });

  yield {
    event: 'ack',
    data: {
      projectId: execution.projectId,
      agentId: input.agentId,
      threadId: execution.threadId,
      resourceId: execution.resourceId,
    },
  };

  for await (const token of stream.textStream) {
    yield {
      event: 'token',
      data: { text: token },
    };
  }

  const output = await stream.getFullOutput();
  yield {
    event: 'done',
    data: {
      projectId: execution.projectId,
      agentId: input.agentId,
      threadId: execution.threadId,
      text: output.text,
      ...(output.runId ? { runId: output.runId } : {}),
      ...(output.response?.modelId ? { modelId: output.response.modelId } : {}),
    },
  };
}

export async function listMindspaceMastraWorkflowsForPrincipal(
  input: { firebaseUid: string; projectId: string },
  deps: MindspaceMastraGatewayDeps,
) {
  const projectContext = await loadProjectContext(input);
  const available = deps.mastra.listWorkflows() as Record<string, unknown>;
  const workflows = listAllowedMindspaceWorkflows({ role: projectContext.role })
    .filter((workflow) => workflow.id in available);

  return {
    projectId: projectContext.projectId,
    workflows,
  };
}

export async function createMindspaceMastraWorkflowRunForPrincipal(
  input: { firebaseUid: string; projectId: string; workflowId: string },
  deps: MindspaceMastraGatewayDeps,
) {
  const projectContext = await loadProjectContext(input);
  assertWorkflowOperationAllowed(input.workflowId, 'create-run');
  const workflow = deps.mastra.getWorkflow(input.workflowId as never);
  const run = await workflow.createRun({
    resourceId: deriveMindspaceMastraResourceId({
      projectId: projectContext.projectId,
      primitiveKind: 'workflow',
      primitiveId: input.workflowId,
    }),
  });

  return {
    projectId: projectContext.projectId,
    workflowId: input.workflowId,
    runId: run.runId,
  };
}

export async function startMindspaceMastraWorkflowForPrincipal(
  input: StartMindspaceMastraWorkflowInput,
  deps: MindspaceMastraGatewayDeps,
) {
  assertWorkflowOperationAllowed(input.workflowId, 'start');
  const execution = await buildGatewayExecution({
    firebaseUid: input.firebaseUid,
    projectId: input.projectId,
    primitiveKind: 'workflow',
    primitiveId: input.workflowId,
    ...(input.threadId ? { suppliedThreadId: input.threadId } : {}),
  }, deps);
  const workflow = deps.mastra.getWorkflow(input.workflowId as never);
  const run = await workflow.createRun({
    ...(input.runId ? { runId: input.runId } : {}),
    resourceId: execution.resourceId,
  });
  const result = await run.start({
    inputData: input.inputData,
    requestContext: execution.requestContext as never,
  });

  return {
    projectId: execution.projectId,
    workflowId: input.workflowId,
    runId: run.runId,
    ...result,
  };
}

async function buildGatewayExecution(input: {
  firebaseUid: string;
  projectId: string;
  primitiveKind: MindspaceMastraPrimitiveKind;
  primitiveId: string;
  suppliedThreadId?: string;
}, deps: MindspaceMastraGatewayDeps) {
  const projectContext = await loadProjectContext({
    firebaseUid: input.firebaseUid,
    projectId: input.projectId,
  });
  const resolved = await resolveMindspaceForProject(input.projectId, {
    mindspaceFactory: deps.mindspaceFactory,
  });
  const resourceId = deriveMindspaceMastraResourceId({
    projectId: projectContext.projectId,
    primitiveKind: input.primitiveKind,
    primitiveId: input.primitiveId,
  });
  const threadId = deriveMindspaceMastraThreadId({
    primitiveKind: input.primitiveKind,
    primitiveId: input.primitiveId,
    ...(input.suppliedThreadId ? { suppliedThreadId: input.suppliedThreadId } : {}),
  });

  return {
    ...buildExecutionContext({
      projectContext,
      mindspaceRootPath: resolved.root.root_path,
      workspace: resolved.workspace,
      resourceId,
      threadId,
    }),
    projectId: projectContext.projectId,
  };
}

function assertAgentOperationAllowed(agentId: string, operation: 'generate' | 'stream') {
  const metadata = mindspaceMastraAgentMetadata[agentId as keyof typeof mindspaceMastraAgentMetadata];
  if (!metadata?.exposed || !metadata.operations.includes(operation)) {
    throw new AccessDeniedError(`Agent ${agentId} is not available through the workspace Mastra gateway.`);
  }
}

function assertWorkflowOperationAllowed(workflowId: string, operation: 'create-run' | 'start') {
  const metadata = mindspaceMastraWorkflowMetadata[workflowId as keyof typeof mindspaceMastraWorkflowMetadata];
  if (!metadata?.exposed || !metadata.operations.includes(operation)) {
    throw new AccessDeniedError(`Workflow ${workflowId} is not available through the workspace Mastra gateway.`);
  }
}

function isRoleAllowed(role: ProjectRole, minRole?: ProjectRole) {
  if (!minRole) return true;
  if (minRole === 'owner') return role === 'owner';
  if (minRole === 'admin') return role === 'owner' || role === 'admin';
  return Boolean(role);
}

function getMinRole(metadata: unknown): ProjectRole | undefined {
  if (typeof metadata !== 'object' || metadata === null || !('minRole' in metadata)) {
    return undefined;
  }
  return (metadata as { minRole?: ProjectRole }).minRole;
}
