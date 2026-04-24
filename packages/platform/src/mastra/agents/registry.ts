// ABOUTME: Central registry for all code-defined Mastra agents.
// ABOUTME: Keeps createMastra small as specialist and supervisor agents grow.

import type { WorkflowRegistry } from '../workflows/registry';
import { createProjectAgent } from './project-agent';
import type { ProjectAgentConfig } from './project-agent';
import { createSummarizerAgent } from './summarizer';
import { createMindspaceReviewerAgent } from './mindspace-reviewer';
import { createMindspaceSupervisorAgent } from './mindspace-supervisor';

export type AgentRegistryDeps = {
  workflows: WorkflowRegistry;
};

export function createAgentRegistry(
  config: ProjectAgentConfig = {},
  deps: AgentRegistryDeps,
) {
  const projectAgent = createProjectAgent(config);
  const summarizer = createSummarizerAgent(config);
  const mindspaceReviewer = createMindspaceReviewerAgent(config);
  const mindspaceSupervisor = createMindspaceSupervisorAgent(
    {
      agents: {
        summarizer,
        mindspaceReviewer,
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
    mindspaceReviewer,
    'mindspace-supervisor': mindspaceSupervisor,
  };
}

export type AgentRegistry = ReturnType<typeof createAgentRegistry>;
