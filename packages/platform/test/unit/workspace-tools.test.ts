// ABOUTME: Unit coverage for workspace Mastra tools.
// ABOUTME: Verifies tools are real Mastra Tool instances that read their dependencies from the execution context.

import { MASTRA_TOOL_MARKER } from '@mastra/core/tools';
import { describe, expect, it } from 'vitest';

import {
  listDirTool,
  readFileTool,
  mindspaceReadOnlyToolkit,
  mindspaceToolkit,
  writeFileTool,
} from '../../src/mastra/tools/mindspace-tools';

function createWorkspaceStub(overrides: Partial<Record<'readFile' | 'readdir' | 'writeFile', unknown>> = {}) {
  return {
    filesystem: {
      readFile: overrides.readFile,
      readdir: overrides.readdir,
      writeFile: overrides.writeFile,
    },
  } as never;
}

describe('mindspace tools are Mastra-native', () => {
  it('readFileTool is recognized as a Mastra Tool', () => {
    expect((readFileTool as { [MASTRA_TOOL_MARKER]?: boolean })[MASTRA_TOOL_MARKER]).toBe(true);
    expect(readFileTool.id).toBe('mindspace.readFile');
  });

  it('listDirTool is recognized as a Mastra Tool', () => {
    expect((listDirTool as { [MASTRA_TOOL_MARKER]?: boolean })[MASTRA_TOOL_MARKER]).toBe(true);
    expect(listDirTool.id).toBe('mindspace.listDir');
  });

  it('writeFileTool is recognized as a Mastra Tool', () => {
    expect((writeFileTool as { [MASTRA_TOOL_MARKER]?: boolean })[MASTRA_TOOL_MARKER]).toBe(true);
    expect(writeFileTool.id).toBe('mindspace.writeFile');
  });
});

describe('readFileTool', () => {
  it('reads a file via workspace injected into the execution context', async () => {
    let capturedPath: string | undefined;
    const workspace = createWorkspaceStub({
      readFile: async (path: string) => {
        capturedPath = path;
        return 'hello';
      },
    });

    const result = await readFileTool.execute!({ path: 'README.md' }, { workspace });

    expect(capturedPath).toBe('README.md');
    expect(result).toEqual({ content: 'hello' });
  });

  it('throws a clear error when workspace is missing from context', async () => {
    await expect(readFileTool.execute!({ path: 'README.md' }, {})).rejects.toThrow(
      /Workspace is not available/,
    );
  });
});

describe('listDirTool', () => {
  it('lists a directory via mindspace filesystem', async () => {
    const workspace = createWorkspaceStub({
      readdir: async (path: string, options?: { recursive?: boolean }) => {
        expect(path).toBe('docs');
        expect(options).toEqual({ recursive: true });
        return [
          { name: 'docs/a.md', type: 'file' },
          { name: 'docs/b.txt', type: 'file' },
        ];
      },
    });

    const result = await listDirTool.execute!(
      { path: 'docs', recursive: true },
      { workspace },
    );

    expect(result).toEqual({ entries: ['docs/a.md', 'docs/b.txt'] });
  });
});

describe('writeFileTool', () => {
  it('writes content to a file via mindspace filesystem', async () => {
    let captured: { path?: string; content?: unknown } = {};
    const workspace = createWorkspaceStub({
      writeFile: async (path: string, content: unknown) => {
        captured = { path, content };
      },
    });

    const result = await writeFileTool.execute!(
      { path: 'docs/spec.md', content: '# Spec' },
      { workspace },
    );

    expect(captured).toEqual({ path: 'docs/spec.md', content: '# Spec' });
    expect(result).toEqual({ path: 'docs/spec.md', bytesWritten: 6 });
  });
});

describe('toolkits', () => {
  it('mindspaceReadOnlyToolkit exposes only read operations', () => {
    expect(Object.keys(mindspaceReadOnlyToolkit).sort()).toEqual(['listDir', 'readFile']);
  });

  it('mindspaceToolkit adds write operations on top of reads', () => {
    expect(Object.keys(mindspaceToolkit).sort()).toEqual(['listDir', 'readFile', 'writeFile']);
  });
});
