// ABOUTME: Read-only specialist that reviews workspace files for risks and gaps.
// ABOUTME: Intended for supervisor delegation; never receives write tools.

import { workspaceReadOnlyToolkit } from '../tools/workspace-tools';
import { buildWorkspaceAgent } from './build-agent';
import type { ProjectAgentConfig } from './project-agent';

export function createWorkspaceReviewerAgent(config: ProjectAgentConfig = {}) {
  return buildWorkspaceAgent({
    id: 'workspace-reviewer' as const,
    name: 'Workspace Reviewer',
    description: [
      'Reviews workspace files for implementation risks, missing tests, stale docs, and architectural inconsistencies.',
      'Returns concise findings with file-path citations.',
      'Does not modify files or write code.',
    ].join(' '),
    instructions: ({ requestContext }) => [
      'You are a read-only reviewer for a project workspace.',
      'Inspect relevant files with listDir and readFile before making claims.',
      'Return findings ordered by severity. Include exact file paths when possible.',
      'Do not write or modify files.',
      `Project: ${requestContext.get('projectId')}`,
      `Caller role: ${requestContext.get('role')}`,
    ].join('\n'),
    toolkit: workspaceReadOnlyToolkit,
    config,
  });
}
