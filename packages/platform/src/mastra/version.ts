// ABOUTME: Agent version targeting helpers — parse query params into a shape
// ABOUTME: that maps onto mastra.getAgentById(id, version) overloads.

import type { Mastra } from '@mastra/core';

/**
 * Opts accepted by `mastra.getAgentById(id, opts)` for version targeting.
 * Either a specific versionId OR a status filter ('draft' | 'published').
 * When undefined, callers should fall back to `mastra.getAgent(id)` which
 * returns the published version.
 */
export type AgentVersionOpts =
  | { versionId: string }
  | { status: 'draft' | 'published' };

/**
 * Reads `versionId` and `status` from a URLSearchParams (or any object with
 * a `.get(name): string | null` method, including Hono's `c.req.query`).
 * Returns `undefined` when neither is present. When both are present,
 * `versionId` wins (it's more specific).
 */
export function parseAgentVersionFromQuery(
  source: { get(name: string): string | null } | URLSearchParams,
): AgentVersionOpts | undefined {
  const versionId = source.get('versionId');
  if (versionId && versionId.length > 0) {
    return { versionId };
  }

  const status = source.get('status');
  if (status === 'draft' || status === 'published') {
    return { status };
  }

  return undefined;
}

/**
 * Resolve an agent by id, honoring an optional version target. When no target
 * is provided, returns the published (default) version via `getAgent` (sync in
 * core). When a target is set, Mastra's `getAgentById(id, version)` overload
 * returns a Promise<Agent> because it reads from the editor's storage — this
 * helper awaits that internally so callers always get a plain Agent.
 */
export async function getAgentWithVersion<Name extends string>(
  mastra: Mastra,
  id: Name,
  version?: AgentVersionOpts,
): Promise<ReturnType<Mastra['getAgent']>> {
  if (!version) {
    return mastra.getAgent(id as never);
  }
  return mastra.getAgentById(id as never, version);
}
