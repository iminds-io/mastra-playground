import { describe, expect, it } from 'vitest';

import { createAgentRegistry } from '../../src/mastra/agents/registry';
import { createWorkflowRegistry } from '../../src/mastra/workflows/registry';

describe('createWorkflowRegistry', () => {
  it('returns all code-defined workflows', () => {
    const workflows = createWorkflowRegistry();

    expect(Object.keys(workflows)).toEqual(expect.arrayContaining(['ingestPipeline']));
    expect(workflows.ingestPipeline).toBeDefined();
  });
});

describe('createAgentRegistry', () => {
  it('returns all code-defined base agents', () => {
    const workflows = createWorkflowRegistry();
    const agents = createAgentRegistry({}, { workflows });

    expect(Object.keys(agents)).toEqual(expect.arrayContaining(['projectAgent', 'summarizer']));
  });
});
