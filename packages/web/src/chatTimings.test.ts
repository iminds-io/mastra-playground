import { describe, expect, it, vi } from 'vitest';

import { createChatTimingFlow } from './chatTimings';

describe('createChatTimingFlow', () => {
  it('records named marks and computes elapsed timings', () => {
    const now = vi
      .spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(145)
      .mockReturnValueOnce(190);

    const flow = createChatTimingFlow('post', {
      log: vi.fn(),
    });

    flow.mark('submit');
    flow.mark('ack');
    const summary = flow.mark('done');

    expect(summary).toEqual({
      flow: 'post',
      marks: {
        submit: 100,
        ack: 145,
        done: 190,
      },
      durations: {
        submit_to_ack: 45,
        submit_to_done: 90,
        ack_to_done: 45,
      },
    });

    now.mockRestore();
  });

  it('tolerates incomplete flows and resets cleanly', () => {
    const flow = createChatTimingFlow('reply');

    expect(flow.summary()).toEqual({
      flow: 'reply',
      marks: {},
      durations: {},
    });

    flow.mark('submit');
    flow.reset();

    expect(flow.summary()).toEqual({
      flow: 'reply',
      marks: {},
      durations: {},
    });
  });
});
