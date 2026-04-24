import { describe, expect, it } from 'vitest';

import { buildMindspaceAgent } from '../../src/mastra/agents/build-agent';

describe('buildMindspaceAgent', () => {
  it('can attach subagents, workflows, and default execution options for supervisor agents', async () => {
    const child = buildMindspaceAgent({
      id: 'child-agent',
      name: 'Child Agent',
      description: 'Test child.',
      instructions: () => 'child',
      toolkit: {},
      config: { openrouterApiKey: 'test-key' },
    });

    const parent = buildMindspaceAgent({
      id: 'parent-agent',
      name: 'Parent Agent',
      description: 'Test parent.',
      instructions: () => 'parent',
      toolkit: {},
      config: { openrouterApiKey: 'test-key' },
      agents: { child },
      workflows: {},
      defaultOptions: { maxSteps: 3 },
    });

    await expect(Promise.resolve(parent.listAgents())).resolves.toMatchObject({ child });
    await expect(Promise.resolve(parent.listWorkflows())).resolves.toEqual({});
    await expect(Promise.resolve(parent.getDefaultOptions())).resolves.toMatchObject({ maxSteps: 3 });
  });
});
