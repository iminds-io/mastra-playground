// ABOUTME: Shared OpenRouter model resolver for platform-owned agents.
// ABOUTME: Centralizes config/env precedence so every agent resolves models the same way.

import type { MastraModelConfig } from '@mastra/core/llm';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

export type AgentModelConfig = {
  openrouterApiKey?: string | undefined;
  openrouterModel?: string | undefined;
};

const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4.1-mini';

export function resolveOpenRouterModel(config: AgentModelConfig = {}): MastraModelConfig {
  const apiKey = config.openrouterApiKey ?? process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is required to resolve an agent model.');
  }

  const provider = createOpenRouter({ apiKey });
  const modelId = config.openrouterModel ?? process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL;

  return provider.chat(modelId);
}
