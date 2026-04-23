// ABOUTME: Read-only agent that summarizes workspace documents.
// ABOUTME: Registers the read-only workspace toolkit (list, read) — no write access.

import { workspaceReadOnlyToolkit } from '../tools/workspace-tools';
import { buildWorkspaceAgent } from './build-agent';
import type { ProjectAgentConfig } from './project-agent';

export function createSummarizerAgent(config: ProjectAgentConfig = {}) {
  return buildWorkspaceAgent({
    id: 'summarizer' as const,
    name: 'Summarizer',
    description: 'Summarizes a set of workspace documents into a concise paragraph.',
    instructions: ({ requestContext }) => [
      'You produce a concise summary of the provided documents.',
      'Use the workspace tools (listDir, readFile) to fetch document content when the caller supplies paths rather than inline text.',
      'Cite document paths inline when referring to specific content (for example, "(see docs/spec.md)").',
      'If no documents are provided, return a one-line response asking which paths to summarize.',
      `Project: ${requestContext.get('projectId')}`,
      `Caller role: ${requestContext.get('role')}`,
    ].join('\n'),
    toolkit: workspaceReadOnlyToolkit,
    config,
  });
}
