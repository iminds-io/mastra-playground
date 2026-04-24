import { describe, expect, it } from 'vitest';

import {
  deriveMindspaceMastraResourceId,
  deriveMindspaceMastraThreadId,
  listAllowedMindspaceAgents,
  listAllowedMindspaceWorkflows,
} from '../../src/services/mindspace-mastra-gateway';

describe('mindspace Mastra gateway policy', () => {
  it('lists only exposed agents for project members', () => {
    expect(listAllowedMindspaceAgents({ role: 'member' }).map((agent) => agent.id).sort()).toEqual([
      'mindspace-supervisor',
      'mindspaceReviewer',
      'summarizer',
    ]);
  });

  it('does not expose write-capable projectAgent by default', () => {
    expect(listAllowedMindspaceAgents({ role: 'member' }).map((agent) => agent.id)).not.toContain('projectAgent');
  });

  it('lists exposed workflows for project members', () => {
    expect(listAllowedMindspaceWorkflows({ role: 'member' }).map((workflow) => workflow.id)).toEqual([
      'ingestPipeline',
    ]);
  });

  it('derives server-owned memory resource ids', () => {
    expect(deriveMindspaceMastraResourceId({
      projectId: 'project-1',
      primitiveKind: 'agent',
      primitiveId: 'summarizer',
    })).toBe('mindspace-mastra:agent:summarizer:project:project-1');
  });

  it('uses caller thread ids only as thread ids, not resource ids', () => {
    expect(deriveMindspaceMastraThreadId({
      primitiveKind: 'agent',
      primitiveId: 'summarizer',
      suppliedThreadId: 'client-thread',
    })).toBe('client-thread');
  });
});
