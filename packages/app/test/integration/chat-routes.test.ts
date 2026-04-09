import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/server/factory';

describe('chat routes', () => {
  it('lists channels for an authenticated project member', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return {
            uid: 'firebase-user-1',
            email: 'user@example.com',
            emailVerified: true,
            name: 'Demo User',
            picture: null,
            authTime: 123,
            rawClaims: {},
          };
        },
      },
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

    const response = await app.request('/api/projects/project-1/channels', {
      headers: {
        authorization: 'Bearer demo-token',
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      channels: [
        {
          id: 'channel-1',
          name: 'general',
          slug: 'general',
        },
      ],
    });
  });

  it('creates a new channel for an authenticated project member', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return {
            uid: 'firebase-user-1',
            email: 'user@example.com',
            emailVerified: true,
            name: 'Demo User',
            picture: null,
            authTime: 123,
            rawClaims: {},
          };
        },
      },
      createProjectChannel: async () => ({
        channel: {
          id: 'channel-2',
          name: 'engineering',
          slug: 'engineering',
        },
      }),
    });

    const response = await app.request('/api/projects/project-1/channels', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'engineering' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      channel: {
        id: 'channel-2',
        name: 'engineering',
        slug: 'engineering',
      },
    });
  });

  it('creates a thread and posts messages to the persisted chat endpoint', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return {
            uid: 'firebase-user-1',
            email: 'user@example.com',
            emailVerified: true,
            name: 'Demo User',
            picture: null,
            authTime: 123,
            rawClaims: {},
          };
        },
      },
      createChannelThread: async () => ({
        thread: {
          id: 'thread-1',
          channelId: 'channel-1',
          title: 'New thread',
        },
      }),
      sendChannelMessage: async () => ({
        resourceId: 'channel:channel-1',
        workspaceRootPath: '/tmp/project-1',
        threadId: 'thread-1',
        runId: 'run-123',
        modelId: 'openai/gpt-4.1-mini',
        text: 'hello from channel thread',
      }),
    });

    const createThreadResponse = await app.request('/api/projects/project-1/channels/channel-1/threads', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: 'New thread' }),
    });

    expect(createThreadResponse.status).toBe(200);
    expect(await createThreadResponse.json()).toEqual({
      thread: {
        id: 'thread-1',
        channelId: 'channel-1',
        title: 'New thread',
      },
    });

    const sendMessageResponse = await app.request(
      '/api/projects/project-1/channels/channel-1/threads/thread-1/messages',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer demo-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ message: 'hello' }),
      },
    );

    expect(sendMessageResponse.status).toBe(200);
    expect(await sendMessageResponse.json()).toEqual({
      resourceId: 'channel:channel-1',
      workspaceRootPath: '/tmp/project-1',
      threadId: 'thread-1',
      runId: 'run-123',
      modelId: 'openai/gpt-4.1-mini',
      text: 'hello from channel thread',
    });
  });
});
