// ABOUTME: Central registry for all code-defined Mastra workflows.
// ABOUTME: Keeps createMastra stable as workflow count grows.

import { createIngestPipelineWorkflow } from './ingest-pipeline';

export function createWorkflowRegistry() {
  return {
    ingestPipeline: createIngestPipelineWorkflow(),
  };
}

export type WorkflowRegistry = ReturnType<typeof createWorkflowRegistry>;
