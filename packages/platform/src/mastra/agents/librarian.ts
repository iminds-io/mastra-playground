// ABOUTME: Librarian system mind for channel guidance and mindspace orientation
// ABOUTME: Uses the shared mindspace toolkit so it can ground answers in project files

import { mindspaceToolkit } from '../tools/mindspace-tools';
import { buildMindspaceAgent } from './build-agent';
import type { AgentModelConfig } from './model';

export type LibrarianAgentConfig = AgentModelConfig;

const LIBRARIAN_DEFAULT_MODEL = 'anthropic/claude-sonnet-4-6';

export function createLibrarianAgent(config: LibrarianAgentConfig = {}) {
  return buildMindspaceAgent({
    id: 'librarian' as const,
    name: 'Librarian',
    description: 'Channel guide and knowledge navigator for the mindspace.',
    instructions: ({ requestContext }) =>
      [
        'You are the Librarian, a system mind for this mindspace.',
        'Help users understand channels, navigate project knowledge, and orient themselves quickly.',
        'When asked about a channel, explain its purpose, what belongs there, and how to use it effectively.',
        'When welcoming users, briefly orient them to the mindspace and the channel they are in.',
        'Use workspace tools to inspect the project so your guidance is grounded in the actual files and structure.',
        'Keep responses helpful, concise, and well-structured with markdown.',
        `Current project ID: ${requestContext.get('projectId')}`,
        `Current organization ID: ${requestContext.get('organizationId')}`,
      ].join('\n'),
    toolkit: mindspaceToolkit,
    config: {
      ...config,
      openrouterModel: config.openrouterModel ?? LIBRARIAN_DEFAULT_MODEL,
    },
  });
}
