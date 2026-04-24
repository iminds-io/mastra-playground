// ABOUTME: Multi-step workflow that lists a workspace subtree and summarizes it.
// ABOUTME: Demonstrates workflow and agent composition in one request context.

import { createStep, createWorkflow } from '@mastra/core/workflows';
import type { RequestContext } from '@mastra/core/request-context';
import type { Workspace } from '@mastra/core/workspace';
import { z } from 'zod';

import type { ProjectAgentRequestContext } from '../execution/request-context';

function normalizeWorkspacePath(path: string) {
  return path === '/' ? '.' : path;
}

export function createIngestPipelineWorkflow() {
  const collectStep = createStep({
    id: 'collect',
    inputSchema: z.object({ rootPath: z.string() }),
    outputSchema: z.object({ files: z.array(z.string()) }),
    execute: async ({ inputData, requestContext }) => {
      const context = requestContext as RequestContext<ProjectAgentRequestContext>;
      const workspace = context.get('workspace') as Workspace;
      if (!workspace.filesystem) {
        throw new Error('Workspace filesystem is not available in request context.');
      }
      const entries = await workspace.filesystem.readdir(normalizeWorkspacePath(inputData.rootPath), { recursive: true });
      return { files: entries.map((entry) => entry.name).filter((entry) => entry.endsWith('.md')) };
    },
  });

  const summarizeStep = createStep({
    id: 'summarize',
    inputSchema: z.object({ files: z.array(z.string()) }),
    outputSchema: z.object({ summary: z.string(), filesCount: z.number() }),
    execute: async ({ inputData, mastra, requestContext }) => {
      if (inputData.files.length === 0) {
        return { summary: '', filesCount: 0 };
      }

      const summarizer = mastra.getAgent('summarizer');
      const context = requestContext as RequestContext<ProjectAgentRequestContext>;
      const resourceId = context.get('mastra__resourceId');
      const threadId = context.get('mastra__threadId');
      const output = await summarizer.generate(
        `Summarize these mindspace files:\n${inputData.files.map((file) => `- ${file}`).join('\n')}`,
        {
          requestContext,
          memory: { resource: resourceId, thread: threadId },
        },
      );

      return { summary: output.text, filesCount: inputData.files.length };
    },
  });

  return createWorkflow({
    id: 'ingestPipeline',
    inputSchema: z.object({ rootPath: z.string() }),
    outputSchema: z.object({ summary: z.string(), filesCount: z.number() }),
  })
    .then(collectStep)
    .then(summarizeStep)
    .commit();
}
