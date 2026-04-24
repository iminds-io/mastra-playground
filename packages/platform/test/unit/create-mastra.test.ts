import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it } from 'vitest';

import { createMastra } from '../../src/mastra/create-mastra';
import type { ProjectAgentRequestContext } from '../../src/mastra/execution/request-context';

type OverridableFields = {
  tools: unknown;
};

async function resolveAgentTools(agent: { __getOverridableFields?: () => OverridableFields }) {
  const fields = agent.__getOverridableFields?.();
  const raw = fields?.tools;
  const resolved = typeof raw === 'function'
    ? await (raw as (args: { requestContext: RequestContext<ProjectAgentRequestContext> }) => unknown)({
        requestContext: new RequestContext<ProjectAgentRequestContext>(),
      })
    : raw;
  return resolved as Record<string, { id?: string }> | undefined;
}

describe('createMastra', () => {
  it('creates a Mastra instance with project and summarizer agents registered', () => {
    const mastra = createMastra('postgres://postgres:postgres@localhost:5432/hono_workspace');

    expect(mastra).toBeDefined();
    expect(mastra.getAgent('projectAgent')).toBeDefined();
    expect(mastra.getAgent('summarizer')).toBeDefined();
    expect(mastra.getWorkflow('ingestPipeline')).toBeDefined();
  });

  it('registers the full workspace toolkit on the project agent', async () => {
    const mastra = createMastra('postgres://postgres:postgres@localhost:5432/hono_workspace');
    const tools = await resolveAgentTools(mastra.getAgent('projectAgent') as never);

    expect(tools).toBeDefined();
    expect(Object.keys(tools ?? {}).sort()).toEqual(['listDir', 'readFile', 'writeFile']);
    expect(tools?.readFile?.id).toBe('mindspace.readFile');
    expect(tools?.writeFile?.id).toBe('mindspace.writeFile');
  });

  it('registers only read-only mindspace tools on the summarizer', async () => {
    const mastra = createMastra('postgres://postgres:postgres@localhost:5432/hono_workspace');
    const tools = await resolveAgentTools(mastra.getAgent('summarizer') as never);

    expect(tools).toBeDefined();
    expect(Object.keys(tools ?? {}).sort()).toEqual(['listDir', 'readFile']);
  });

  it('registers mindspaceReviewer with read-only tools', async () => {
    const mastra = createMastra('postgres://postgres:postgres@localhost:5432/hono_workspace');
    const reviewer = mastra.getAgent('mindspaceReviewer');
    const tools = await resolveAgentTools(reviewer as never);

    expect(reviewer).toBeDefined();
    expect(Object.keys(tools ?? {}).sort()).toEqual(['listDir', 'readFile']);
  });

  it('registers mindspace-supervisor with specialist subagents and workflows', async () => {
    const mastra = createMastra('postgres://postgres:postgres@localhost:5432/hono_workspace');
    const supervisor = mastra.getAgent('mindspace-supervisor');

    expect(supervisor).toBeDefined();
    const subagents = await supervisor.listAgents();
    expect(Object.keys(subagents)).toEqual(expect.arrayContaining(['summarizer', 'mindspaceReviewer']));
    expect(Object.keys(subagents)).not.toContain('projectAgent');

    const workflows = await supervisor.listWorkflows();
    expect(Object.keys(workflows)).toEqual(expect.arrayContaining(['ingestPipeline']));
  });
});
