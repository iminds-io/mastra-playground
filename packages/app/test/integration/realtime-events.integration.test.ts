import { describe, expect, it } from 'vitest';

import { ChannelEventEmitter } from '@mastra-mindspace/platform';

import { createApp } from '../../src/server/factory';

const verifiedPrincipal = {
  uid: 'firebase-user-1',
  email: 'user@example.com',
  emailVerified: true,
  name: 'Demo User',
  picture: null,
  authTime: 123,
  rawClaims: {},
};

describe('realtime events route', () => {
  it('rejects requests without a token query parameter', async () => {
    const app = await createApp();

    const response = await app.request('/api/projects/project-1/channels/channel-1/events');

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Missing token query parameter' });
  });

  it('streams the initial connected event and subsequent channel events', async () => {
    const emitter = new ChannelEventEmitter();
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      channelEventEmitter: emitter,
      listProjectChannels: async () => ({
        channels: [
          {
            id: 'channel-1',
            name: 'general',
            slug: 'general',
          },
        ],
      }),
    });

    const response = await app.request('/api/projects/project-1/channels/channel-1/events?token=demo-token');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.body).toBeTruthy();

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    const firstChunk = await reader.read();
    const firstText = decoder.decode(firstChunk.value);
    expect(firstText).toContain('event: connected');

    emitter.emit('channel-1', {
      event: 'heartbeat',
      data: {},
    });

    const secondChunk = await reader.read();
    const secondText = decoder.decode(secondChunk.value);
    expect(secondText).toContain('event: heartbeat');

    await reader.cancel();
  });
});
