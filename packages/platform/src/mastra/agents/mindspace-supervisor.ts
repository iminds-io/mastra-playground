// ABOUTME: Supervisor agent for coordinating safe read-only mindspace specialists.
// ABOUTME: Uses normal generate/stream supervisor behavior; do not use deprecated .network().

import type { Agent } from '@mastra/core/agent';
import type { Workflow } from '@mastra/core/workflows';

import { mindspaceReadOnlyToolkit } from '../tools/mindspace-tools';
import { buildMindspaceAgent } from './build-agent';
import type { ProjectAgentConfig } from './project-agent';

export type MindspaceSupervisorDeps = {
  agents: Record<string, Agent<any, any, any, any>>;
  workflows: Record<string, Workflow<any, any, any, any, any, any, any, any>>;
};

export function createMindspaceSupervisorAgent(
  deps: MindspaceSupervisorDeps,
  config: ProjectAgentConfig = {},
) {
  return buildMindspaceAgent({
    id: 'mindspace-supervisor' as const,
    name: 'Mindspace Supervisor',
    description: [
      'Coordinates read-only mindspace specialists for project analysis, summarization, and review.',
      'Use when a request may require more than one specialist or a workflow.',
    ].join(' '),
    instructions: ({ requestContext }) => [
      'You coordinate safe read-only specialists for a project mindspace.',
      'Available specialists:',
      '- summarizer: summarizes selected mindspace documents.',
      '- mindspaceReviewer: reviews files for risks, stale docs, and missing tests.',
      'Available workflows:',
      '- ingestPipeline: lists markdown files and summarizes them.',
      'Delegate when a specialist is better suited than answering directly.',
      'Synthesize specialist results into one concise final answer.',
      'Do not claim file facts unless a specialist or workflow inspected the workspace.',
      `Project: ${requestContext.get('projectId')}`,
      `Caller role: ${requestContext.get('role')}`,
    ].join('\n'),
    toolkit: mindspaceReadOnlyToolkit,
    agents: deps.agents,
    workflows: deps.workflows,
    defaultOptions: {
      maxSteps: 8,
      delegation: {
        messageFilter: ({ messages }) => messages.slice(-12),
      },
      onIterationComplete: ({ iteration, text }) => {
        if (iteration >= 8) {
          return {
            continue: false,
            feedback: 'Stop delegation and synthesize the best available answer.',
          };
        }
        if (text.length > 1200) {
          return { continue: false };
        }
        return { continue: true };
      },
    },
    config,
  });
}
