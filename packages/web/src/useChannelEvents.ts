import { useEffect } from 'react';

import type { ChannelEventMap, ChannelEventType } from './channel-events';

type AuthUser = {
  getIdToken(): Promise<string>;
};

export type ChannelEventHandlers = {
  new_thread?: (data: ChannelEventMap['new_thread']) => void;
  new_message?: (data: ChannelEventMap['new_message']) => void;
  thread_updated?: (data: ChannelEventMap['thread_updated']) => void;
  mind_streaming?: (data: ChannelEventMap['mind_streaming']) => void;
  heartbeat?: (data: ChannelEventMap['heartbeat']) => void;
};

export function useChannelEvents(input: {
  user: AuthUser | null;
  projectId: string | null;
  channelId: string | null;
  handlers: ChannelEventHandlers;
}) {
  const { user, projectId, channelId, handlers } = input;

  useEffect(() => {
    if (!user || !projectId || !channelId) {
      return;
    }

    let source: EventSource | null = null;
    let closed = false;

    void user.getIdToken().then((token) => {
      if (closed) {
        return;
      }

      const url = new URL(`/api/projects/${projectId}/channels/${channelId}/events`, window.location.origin);
      url.searchParams.set('token', token);
      source = new EventSource(url.toString());

      const bind = <K extends ChannelEventType>(eventName: K, handler?: (data: ChannelEventMap[K]) => void) => {
        if (!handler || !source) {
          return;
        }

        source.addEventListener(eventName, (event) => {
          const payload = JSON.parse((event as MessageEvent<string>).data) as ChannelEventMap[K];
          handler(payload);
        });
      };

      bind('new_thread', handlers.new_thread);
      bind('new_message', handlers.new_message);
      bind('thread_updated', handlers.thread_updated);
      bind('mind_streaming', handlers.mind_streaming);
      bind('heartbeat', handlers.heartbeat);
    });

    return () => {
      closed = true;
      source?.close();
    };
  }, [user, projectId, channelId, handlers]);
}
