import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/server/factory';
import { AccessDeniedError } from '@mastra-mindspace/platform';

const verifiedPrincipal = {
  uid: 'firebase-user-1',
  email: 'user@example.com',
  emailVerified: true,
  name: 'Demo User',
  picture: null,
  authTime: 123,
  rawClaims: {},
};

describe('chat routes', () => {
  it('lists channels for an authenticated project member', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
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

  it('returns 403 when the authenticated user does not have access to the project', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      listProjectChannels: async () => {
        throw new AccessDeniedError('User does not have access to this project');
      },
    });

    const response = await app.request('/api/projects/project-1/channels', {
      headers: {
        authorization: 'Bearer demo-token',
      },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'User does not have access to this project',
    });
  });

  it('creates a new channel for an authenticated project member', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
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

  it('lists a channel feed using the root message of each thread', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      listChannelFeed: async () => ({
        channel: {
          id: 'channel-1',
          name: 'general',
          slug: 'general',
        },
        posts: [
          {
            threadId: 'thread-1',
            rootMessageId: 'message-1',
            rootMessageText: 'Kick off the implementation plan.',
            rootMessageRole: 'user',
            replyCount: 2,
            lastMessageAt: '2026-04-09T00:00:00.000Z',
            createdAt: '2026-04-09T00:00:00.000Z',
          },
        ],
      }),
    });

    const response = await app.request('/api/projects/project-1/channels/channel-1/feed', {
      headers: {
        authorization: 'Bearer demo-token',
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      channel: {
        id: 'channel-1',
        name: 'general',
        slug: 'general',
      },
      posts: [
        {
          threadId: 'thread-1',
          rootMessageId: 'message-1',
          rootMessageText: 'Kick off the implementation plan.',
          rootMessageRole: 'user',
          replyCount: 2,
          lastMessageAt: '2026-04-09T00:00:00.000Z',
          createdAt: '2026-04-09T00:00:00.000Z',
        },
      ],
    });
  });

  it('creates a new channel post that starts a thread', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      createChannelPost: async () => ({
        thread: {
          id: 'thread-1',
          channelId: 'channel-1',
          title: null,
          lastMessageAt: '2026-04-09T00:00:00.000Z',
          createdAt: '2026-04-09T00:00:00.000Z',
          updatedAt: '2026-04-09T00:00:00.000Z',
        },
        rootMessage: {
          id: 'message-1',
          role: 'user',
          text: 'Ship the new mindspace shell.',
          createdAt: '2026-04-09T00:00:00.000Z',
        },
      }),
    });

    const response = await app.request('/api/projects/project-1/channels/channel-1/posts', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message: 'Ship the new mindspace shell.' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      thread: {
        id: 'thread-1',
        channelId: 'channel-1',
        title: null,
        lastMessageAt: '2026-04-09T00:00:00.000Z',
        createdAt: '2026-04-09T00:00:00.000Z',
        updatedAt: '2026-04-09T00:00:00.000Z',
      },
      rootMessage: {
        id: 'message-1',
        role: 'user',
        text: 'Ship the new mindspace shell.',
        createdAt: '2026-04-09T00:00:00.000Z',
      },
    });
  });

  it('streams assistant replies for an existing thread over sse', async () => {
    const app = await createApp({
      tokenVerifier: {
        async verifyIdToken() {
          return verifiedPrincipal;
        },
      },
      streamChannelReply: async function* () {
        yield { event: 'ack', data: { threadId: 'thread-1' } };
        yield { event: 'token', data: { text: 'hello ' } };
        yield { event: 'token', data: { text: 'world' } };
        yield {
          event: 'message_saved',
          data: {
            id: 'assistant-1',
            role: 'assistant',
            text: 'hello world',
            createdAt: '2026-04-09T00:00:00.000Z',
          },
        };
        yield { event: 'done', data: { threadId: 'thread-1' } };
      },
    });

    const response = await app.request('/api/projects/project-1/channels/channel-1/threads/thread-1/messages/stream', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message: 'hello' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(await response.text()).toBe(
      [
        'event: ack',
        'data: {"threadId":"thread-1"}',
        '',
        'event: token',
        'data: {"text":"hello "}',
        '',
        'event: token',
        'data: {"text":"world"}',
        '',
        'event: message_saved',
        'data: {"id":"assistant-1","role":"assistant","text":"hello world","createdAt":"2026-04-09T00:00:00.000Z"}',
        '',
        'event: done',
        'data: {"threadId":"thread-1"}',
        '',
        '',
      ].join('\n'),
    );
  });
});
