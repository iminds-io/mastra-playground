// ABOUTME: Read-only specialist that reviews mindspace files for risks and gaps.
// ABOUTME: Intended for supervisor delegation; never receives write tools.

import { mindspaceReadOnlyToolkit } from '../tools/mindspace-tools';
import { buildMindspaceAgent } from './build-agent';
import type { ProjectAgentConfig } from './project-agent';

export function createMindspaceReviewerAgent(config: ProjectAgentConfig = {}) {
  return buildMindspaceAgent({
    id: 'mindspace-reviewer' as const,
    name: 'Mindspace Reviewer',
    description: [
      'Reviews mindspace files for implementation risks, missing tests, stale docs, and architectural inconsistencies.',
      'Returns concise findings with file-path citations.',
      'Does not modify files or write code.',
    ].join(' '),
    instructions: ({ requestContext }) => [
      'You are a read-only reviewer for a project mindspace.',
      'Inspect relevant files with listDir and readFile before making claims.',
      'Return findings ordered by severity. Include exact file paths when possible.',
      'Do not write or modify files.',
      `Project: ${requestContext.get('projectId')}`,
      `Caller role: ${requestContext.get('role')}`,
    ].join('\n'),
    toolkit: mindspaceReadOnlyToolkit,
    config,
  });
}
