// ABOUTME: Unit tests for the agent-version helpers (parseAgentVersionFromQuery + getAgentWithVersion).
// ABOUTME: Validates query-param parsing and that getAgentWithVersion falls through to getAgent when no version is set.

import { describe, expect, it, vi } from 'vitest';

import { getAgentWithVersion, parseAgentVersionFromQuery } from '../../src/mastra/version';

function sourceWith(params: Record<string, string>) {
  return {
    get(name: string) {
      return params[name] ?? null;
    },
  };
}

describe('parseAgentVersionFromQuery', () => {
  it('returns undefined when no version params are present', () => {
    expect(parseAgentVersionFromQuery(sourceWith({}))).toBeUndefined();
  });

  it('returns { versionId } when versionId query param is set', () => {
    expect(parseAgentVersionFromQuery(sourceWith({ versionId: 'abc-123' }))).toEqual({
      versionId: 'abc-123',
    });
  });

  it('returns { status } for draft or published', () => {
    expect(parseAgentVersionFromQuery(sourceWith({ status: 'draft' }))).toEqual({ status: 'draft' });
    expect(parseAgentVersionFromQuery(sourceWith({ status: 'published' }))).toEqual({ status: 'published' });
  });

  it('ignores invalid status values', () => {
    expect(parseAgentVersionFromQuery(sourceWith({ status: 'archived' }))).toBeUndefined();
    expect(parseAgentVersionFromQuery(sourceWith({ status: '' }))).toBeUndefined();
  });

  it('prefers versionId over status when both are present', () => {
    expect(
      parseAgentVersionFromQuery(sourceWith({ versionId: 'v1', status: 'draft' })),
    ).toEqual({ versionId: 'v1' });
  });

  it('ignores empty versionId', () => {
    expect(parseAgentVersionFromQuery(sourceWith({ versionId: '' }))).toBeUndefined();
  });

  it('works with URLSearchParams too', () => {
    const params = new URLSearchParams('versionId=abc');
    expect(parseAgentVersionFromQuery(params)).toEqual({ versionId: 'abc' });
  });
});

describe('getAgentWithVersion', () => {
  function fakeMastra(): { getAgent: ReturnType<typeof vi.fn>; getAgentById: ReturnType<typeof vi.fn> } {
    return {
      getAgent: vi.fn().mockReturnValue({ kind: 'default' }),
      getAgentById: vi.fn().mockReturnValue({ kind: 'versioned' }),
    };
  }

  it('falls through to getAgent when no version is provided', async () => {
    const m = fakeMastra();
    const agent = await getAgentWithVersion(m as never, 'summarizer');
    expect(agent).toEqual({ kind: 'default' });
    expect(m.getAgent).toHaveBeenCalledWith('summarizer');
    expect(m.getAgentById).not.toHaveBeenCalled();
  });

  it('calls getAgentById with versionId when provided', async () => {
    const m = fakeMastra();
    const agent = await getAgentWithVersion(m as never, 'summarizer', { versionId: 'v42' });
    expect(agent).toEqual({ kind: 'versioned' });
    expect(m.getAgentById).toHaveBeenCalledWith('summarizer', { versionId: 'v42' });
    expect(m.getAgent).not.toHaveBeenCalled();
  });

  it('calls getAgentById with status when provided', async () => {
    const m = fakeMastra();
    const agent = await getAgentWithVersion(m as never, 'summarizer', { status: 'draft' });
    expect(agent).toEqual({ kind: 'versioned' });
    expect(m.getAgentById).toHaveBeenCalledWith('summarizer', { status: 'draft' });
  });

  it('awaits the Promise returned by getAgentById (version path is async)', async () => {
    const m = {
      getAgent: vi.fn().mockReturnValue({ kind: 'default' }),
      getAgentById: vi.fn().mockResolvedValue({ kind: 'versioned-async' }),
    };
    const agent = await getAgentWithVersion(m as never, 'summarizer', { status: 'draft' });
    expect(agent).toEqual({ kind: 'versioned-async' });
  });
});
