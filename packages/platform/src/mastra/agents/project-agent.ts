import { Agent } from '@mastra/core/agent';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { Memory } from '@mastra/memory';

import type { ProjectAgentRequestContext } from '../execution/request-context';

const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4.1-mini';

function resolveProjectAgentModel() {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is required to execute the project agent.');
  }

  const provider = createOpenRouter({ apiKey });
  const modelId = process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL;

  return provider.chat(modelId);
}

export function createProjectAgent() {
  return new Agent<'project-agent', never, undefined, ProjectAgentRequestContext>({
    id: 'project-agent',
    name: 'Project Agent',
    description: 'Default workspace-aware project assistant.',
    instructions: ({ requestContext }) => [
      'You are the project workspace assistant for a Hono + Mastra development environment.',
      'Answer directly and keep responses concise unless the user asks for depth.',
      'When the workspace is available, treat it as the source of truth for project-local context.',
      `Current project ID: ${requestContext.get('projectId')}`,
      `Current organization ID: ${requestContext.get('organizationId')}`,
      `Caller role: ${requestContext.get('role')}`,
    ].join('\n'),
    model: () => resolveProjectAgentModel(),
    memory: new Memory(),
    workspace: ({ requestContext }) => requestContext.get('workspace'),
  });
}
