// ABOUTME: Metadata for code-defined Mastra primitives used by mindspace gateway policy.
// ABOUTME: Keeps route exposure explicit instead of inferring safety from object internals.

export type MindspaceMastraCapability = 'read' | 'write';
export type MindspaceMastraOperation =
  | 'generate'
  | 'stream'
  | 'create-run'
  | 'start';

export type MindspaceMastraPrimitiveMetadata = {
  id: string;
  capability: MindspaceMastraCapability;
  operations: MindspaceMastraOperation[];
  minRole?: 'owner' | 'admin' | 'member';
  exposed: boolean;
};

export const mindspaceMastraAgentMetadata = {
  projectAgent: {
    id: 'projectAgent',
    capability: 'write',
    operations: ['generate', 'stream'],
    minRole: 'owner',
    exposed: false,
  },
  summarizer: {
    id: 'summarizer',
    capability: 'read',
    operations: ['generate', 'stream'],
    exposed: true,
  },
  mindspaceReviewer: {
    id: 'mindspaceReviewer',
    capability: 'read',
    operations: ['generate', 'stream'],
    exposed: true,
  },
  'mindspace-supervisor': {
    id: 'mindspace-supervisor',
    capability: 'read',
    operations: ['generate', 'stream'],
    exposed: true,
  },
} as const satisfies Record<string, MindspaceMastraPrimitiveMetadata>;

export const mindspaceMastraWorkflowMetadata = {
  ingestPipeline: {
    id: 'ingestPipeline',
    capability: 'read',
    operations: ['create-run', 'start'],
    exposed: true,
  },
} as const satisfies Record<string, MindspaceMastraPrimitiveMetadata>;
