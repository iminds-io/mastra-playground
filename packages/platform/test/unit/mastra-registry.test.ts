import { describe, expect, it } from 'vitest';

import { createAgentRegistry } from '../../src/mastra/agents/registry';
import {
  mindspaceMastraAgentMetadata,
  mindspaceMastraWorkflowMetadata,
} from '../../src/mastra/registry-metadata';
import { createWorkflowRegistry } from '../../src/mastra/workflows/registry';

describe('createWorkflowRegistry', () => {
  it('returns all code-defined workflows', () => {
    const workflows = createWorkflowRegistry();

    expect(Object.keys(workflows)).toEqual(expect.arrayContaining(['ingestPipeline']));
    expect(workflows.ingestPipeline).toBeDefined();
  });

  it('has mindspace gateway metadata for every code-defined workflow', () => {
    const workflows = createWorkflowRegistry();

    expect(Object.keys(mindspaceMastraWorkflowMetadata).sort()).toEqual(Object.keys(workflows).sort());
  });
});

describe('createAgentRegistry', () => {
  it('returns all code-defined base agents', () => {
    const workflows = createWorkflowRegistry();
    const agents = createAgentRegistry({}, { workflows });

    expect(Object.keys(agents)).toEqual(expect.arrayContaining(['projectAgent', 'summarizer']));
  });

  it('has mindspace gateway metadata for every code-defined agent', () => {
    const workflows = createWorkflowRegistry();
    const agents = createAgentRegistry({}, { workflows });

    expect(Object.keys(mindspaceMastraAgentMetadata).sort()).toEqual(Object.keys(agents).sort());
  });

  it('keeps mindspace gateway metadata ids aligned with registry keys', () => {
    for (const [key, metadata] of Object.entries(mindspaceMastraAgentMetadata)) {
      expect(metadata.id).toBe(key);
    }
    for (const [key, metadata] of Object.entries(mindspaceMastraWorkflowMetadata)) {
      expect(metadata.id).toBe(key);
    }
  });
});
