// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { runAdminTest, streamThreadReply } from './api';

describe('apiFetch', () => {
  it('surfaces plain-text server errors without throwing a JSON parse exception', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('Internal Server Error', {
          status: 500,
          headers: {
            'content-type': 'text/plain',
          },
        }),
      ),
    );

    await expect(
      runAdminTest(
        {
          getIdToken: async () => 'demo-token',
        },
        'project-1',
        'hello',
      ),
    ).rejects.toThrow('[500] Internal Server Error');
  });

  it('parses server-sent events from the streaming reply endpoint', async () => {
    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  [
                    'event: ack',
                    'data: {"threadId":"thread-1"}',
                    '',
                    'event: token',
                    'data: {"text":"hello"}',
                    '',
                    'event: done',
                    'data: {"threadId":"thread-1"}',
                    '',
                  ].join('\n'),
                ),
              );
              controller.close();
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'text/event-stream',
            },
          },
        ),
      ),
    );

    await streamThreadReply(
      {
        getIdToken: async () => 'demo-token',
      },
      'project-1',
      'channel-1',
      'thread-1',
      'hello',
      {
        onEvent(event) {
          events.push(event);
        },
      },
    );

    expect(events).toEqual([
      {
        event: 'ack',
        data: {
          threadId: 'thread-1',
        },
      },
      {
        event: 'token',
        data: {
          text: 'hello',
        },
      },
      {
        event: 'done',
        data: {
          threadId: 'thread-1',
        },
      },
    ]);
  });
});
