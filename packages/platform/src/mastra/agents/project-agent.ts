// ABOUTME: Default workspace-aware project assistant.
// ABOUTME: Registers the full workspace toolkit (read, list, write).

import { workspaceToolkit } from '../tools/workspace-tools';
import { buildWorkspaceAgent } from './build-agent';
import type { AgentModelConfig } from './model';

export type ProjectAgentConfig = AgentModelConfig;

export function createProjectAgent(config: ProjectAgentConfig = {}) {
  return buildWorkspaceAgent({
    id: 'project-agent' as const,
    name: 'Project Agent',
    description: 'Default workspace-aware project assistant.',
    instructions: ({ requestContext }) => [
      'You are the project workspace assistant for a Hono + Mastra development environment.',
      'Answer directly and keep responses concise unless the user asks for depth.',
      'The workspace is the source of truth for project-local context. Use the workspace tools (listDir, readFile, writeFile) to inspect and modify it instead of guessing.',
      `Current project ID: ${requestContext.get('projectId')}`,
      `Current organization ID: ${requestContext.get('organizationId')}`,
      `Caller role: ${requestContext.get('role')}`,
    ].join('\n'),
    toolkit: workspaceToolkit,
    config,
  });
}
