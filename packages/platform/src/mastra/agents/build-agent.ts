// ABOUTME: Single factory for mindspace-aware Mastra agents in this platform.
// ABOUTME: Enforces consistent memory, workspace binding, and tool registration so "declared but not wired" can't recur.

import { Agent } from '@mastra/core/agent';
import type { AgentExecutionOptions } from '@mastra/core/agent';
import type { ToolsInput } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import type { Tool } from '@mastra/core/tools';
import type { Workflow } from '@mastra/core/workflows';
import { Memory } from '@mastra/memory';

import type { ProjectAgentRequestContext } from '../execution/request-context';
import type { AgentModelConfig } from './model';
import { resolveOpenRouterModel } from './model';

type Toolkit = Record<string, Tool<any, any, any, any, any, any, any>>;
type AgentMap = Record<string, Agent<any, any, any, any>>;
type WorkflowMap = Record<string, Workflow<any, any, any, any, any, any, any, any>>;
type MastraAgentConfigMap = Record<string, Agent<string, ToolsInput, undefined, unknown>>;

type InstructionsFn = (args: {
  requestContext: RequestContext<ProjectAgentRequestContext>;
}) => string;

export type MindspaceAgentInput<TId extends string, TToolkit extends Toolkit> = {
  id: TId;
  name: string;
  description: string;
  instructions: InstructionsFn;
  toolkit: TToolkit;
  config?: AgentModelConfig;
  agents?: AgentMap;
  workflows?: WorkflowMap;
  defaultOptions?: AgentExecutionOptions<undefined>;
};

// Mastra's observational memory schedules async work that outlives the
// originating request. On Cloudflare Workers, that background work touches
// the DB pool across request boundaries and triggers "Cannot perform I/O on
// behalf of a different request" errors. Disable until @mastra/core fully
// supports the CF Workers runtime.
const MINDSPACE_AGENT_MEMORY_OPTIONS = { observationalMemory: false } as const;

export function buildMindspaceAgent<TId extends string, TToolkit extends Toolkit>({
  id,
  name,
  description,
  instructions,
  toolkit,
  config = {},
  agents,
  workflows,
  defaultOptions,
}: MindspaceAgentInput<TId, TToolkit>): Agent<TId, TToolkit, undefined, ProjectAgentRequestContext> {
  return new Agent<TId, TToolkit, undefined, ProjectAgentRequestContext>({
    id,
    name,
    description,
    instructions,
    model: () => resolveOpenRouterModel(config),
    memory: new Memory({ options: MINDSPACE_AGENT_MEMORY_OPTIONS }),
    workspace: ({ requestContext }) => requestContext.get('workspace'),
    tools: () => toolkit,
    ...(agents ? { agents: agents as MastraAgentConfigMap } : {}),
    ...(workflows ? { workflows } : {}),
    ...(defaultOptions ? { defaultOptions } : {}),
  });
}
