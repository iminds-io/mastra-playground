// ABOUTME: Mastra-native mindspace tools exposed to agents as callable functions.
// ABOUTME: Toolkits bundle these so agents register a consistent set of file-system capabilities.

import { createTool } from '@mastra/core/tools';
import type { Workspace } from '@mastra/core/workspace';
import { z } from 'zod';

function requireFilesystem(workspace: Workspace | undefined) {
  if (!workspace?.filesystem) {
    throw new Error('Workspace is not available in tool execution context.');
  }
  return workspace.filesystem;
}

export const readFileTool = createTool({
  id: 'mindspace.readFile',
  description: 'Read the contents of a file within the active workspace.',
  inputSchema: z.object({
    path: z.string().describe('Path relative to the mindspace root.'),
  }),
  outputSchema: z.object({
    content: z.string(),
  }),
  execute: async ({ path }, { workspace }) => {
    const filesystem = requireFilesystem(workspace);
    const raw = await filesystem.readFile(path);
    return {
      content: typeof raw === 'string' ? raw : new TextDecoder().decode(raw),
    };
  },
});

export const listDirTool = createTool({
  id: 'mindspace.listDir',
  description: 'List files and directories within a mindspace directory.',
  inputSchema: z.object({
    path: z.string().describe('Directory path relative to the mindspace root. Use "." for the mindspace root.'),
    recursive: z.boolean().optional().describe('When true, descend into subdirectories.'),
  }),
  outputSchema: z.object({
    entries: z.array(z.string()),
  }),
  execute: async ({ path, recursive }, { workspace }) => {
    const filesystem = requireFilesystem(workspace);
    const options = recursive === undefined ? undefined : { recursive };
    const entries = await filesystem.readdir(path, options);
    return { entries: entries.map((entry) => entry.name) };
  },
});

export const writeFileTool = createTool({
  id: 'mindspace.writeFile',
  description: 'Write UTF-8 text content to a file in the active workspace, creating the file (and any missing parent directories) if needed.',
  inputSchema: z.object({
    path: z.string().describe('Path relative to the mindspace root.'),
    content: z.string().describe('UTF-8 text content to write.'),
  }),
  outputSchema: z.object({
    path: z.string(),
    bytesWritten: z.number(),
  }),
  execute: async ({ path, content }, { workspace }) => {
    const filesystem = requireFilesystem(workspace);
    await filesystem.writeFile(path, content);
    return {
      path,
      bytesWritten: new TextEncoder().encode(content).byteLength,
    };
  },
});

export const mindspaceReadOnlyToolkit = {
  readFile: readFileTool,
  listDir: listDirTool,
};

export const mindspaceToolkit = {
  ...mindspaceReadOnlyToolkit,
  writeFile: writeFileTool,
};
