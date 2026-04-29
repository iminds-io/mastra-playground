import { describe, expect, it, vi } from 'vitest';

import { createServiceTimingFlow } from '../../src/services/chat-timings';

describe('createServiceTimingFlow', () => {
  it('records ordered phase durations and emits a structured summary', () => {
    const log = vi.fn();
    const now = vi
      .spyOn(performance, 'now')
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(35)
      .mockReturnValueOnce(90);

    const flow = createServiceTimingFlow('stream-channel-reply', { log });

    flow.mark('load_project_context');
    flow.mark('resolve_mindspace');
    const summary = flow.mark('agent_stream_start');

    expect(summary).toEqual({
      flow: 'stream-channel-reply',
      phases: {
        load_project_context: 10,
        resolve_mindspace: 35,
        agent_stream_start: 90,
      },
      durations: {
        load_project_context_to_resolve_mindspace: 25,
        load_project_context_to_agent_stream_start: 80,
        resolve_mindspace_to_agent_stream_start: 55,
      },
    });
    expect(log).toHaveBeenCalledWith(summary);

    now.mockRestore();
  });
});
