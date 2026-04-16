// ABOUTME: E2E test for Server-Sent Events streaming through the worker.
// ABOUTME: Blocked on @mastra/pg compatibility with CF Workers — see description.

import { describe, it } from 'vitest';

// The streaming endpoint (/messages/stream) goes through Mastra memory, which
// currently hangs on CF Workers due to an issue inside @mastra/pg. The SSE
// stream ordering is exercised at the integration layer in
// packages/platform/test/integration/stream-channel-reply.integration.test.ts
// which uses real Mastra against a real Neon branch in a Node.js process.
//
// Once @mastra/pg works on CF Workers, this test can be un-skipped to verify
// the full SSE transport (event framing, headers, backpressure) through
// the deployed worker.
describe.skip('worker SSE streaming — BLOCKED: @mastra/pg on CF Workers', () => {
  it('streams ack → token → done in order', () => {
    // See .ai/tasks/02_testing_strategy_design.md for context.
  });
});
