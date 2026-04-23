// ABOUTME: Central registry for all code-defined Mastra agents.
// ABOUTME: Keeps createMastra small as specialist and supervisor agents grow.

import type { WorkflowRegistry } from '../workflows/registry';
import { createProjectAgent } from './project-agent';
import type { ProjectAgentConfig } from './project-agent';
import { createSummarizerAgent } from './summarizer';
import { createWorkspaceReviewerAgent } from './workspace-reviewer';
import { createWorkspaceSupervisorAgent } from './workspace-supervisor';

export type AgentRegistryDeps = {
  workflows: WorkflowRegistry;
};

export function createAgentRegistry(
  config: ProjectAgentConfig = {},
  deps: AgentRegistryDeps,
) {
  const projectAgent = createProjectAgent(config);
  const summarizer = createSummarizerAgent(config);
  const workspaceReviewer = createWorkspaceReviewerAgent(config);
  const workspaceSupervisor = createWorkspaceSupervisorAgent(
    {
      agents: {
        summarizer,
        workspaceReviewer,
      },
      workflows: {
        ingestPipeline: deps.workflows.ingestPipeline,
      },
    },
    config,
  );

  return {
    projectAgent,
    summarizer,
    workspaceReviewer,
    'workspace-supervisor': workspaceSupervisor,
  };
}

export type AgentRegistry = ReturnType<typeof createAgentRegistry>;
