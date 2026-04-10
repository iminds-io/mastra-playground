type AuthUser = {
  getIdToken(): Promise<string>;
};

type ResponseMeta = {
  __meta: {
    status: number;
    durationMs: number;
  };
};

export type AccessibleProjectSummary = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: string;
};

export type BootstrapProjectResponse = {
  projectId: string;
  organizationId: string;
  workspaceRootPath: string;
  binding: {
    activeAgentRef: string;
    activeAgentVersion: string;
  };
  defaultChannelId: string;
  project?: AccessibleProjectSummary;
} & ResponseMeta;

export type AdminTestResponse = {
  resourceId: string;
  workspaceRootPath: string;
  threadId: string;
  runId?: string;
  modelId?: string;
  text: string;
} & ResponseMeta;

export type ChannelSummary = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  kind?: string;
  isPrivate?: boolean;
};

export type ChannelFeedPost = {
  threadId: string;
  rootMessageId: string;
  rootMessageText: string;
  rootMessageRole: string;
  replyCount: number;
  lastMessageAt: string | null;
  createdAt: string;
};

export type ThreadSummary = {
  id: string;
  channelId: string;
  title: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ThreadMessage = {
  id: string;
  role: string;
  text: string;
  createdAt: string;
};

export type ThreadDetails = {
  thread: ThreadSummary;
  messages: ThreadMessage[];
} & ResponseMeta;

export type StreamEvent = {
  event: string;
  data: Record<string, unknown>;
};

async function buildHeaders(user: AuthUser, init?: HeadersInit) {
  const token = await user.getIdToken();

  return {
    ...(init ?? {}),
    authorization: `Bearer ${token}`,
  };
}

async function apiFetch<T>(path: string, user: AuthUser, init?: RequestInit): Promise<T> {
  const startedAt = performance.now();
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(await buildHeaders(user, init?.headers)),
      'content-type': 'application/json',
    },
  });

  const durationMs = Math.round(performance.now() - startedAt);
  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(
      `[${response.status}] ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`,
    );
  }

  return {
    ...payload,
    __meta: {
      status: response.status,
      durationMs,
    },
  } as T;
}

function parseEventBlock(block: string): StreamEvent | null {
  const lines = block
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() ?? 'message';
  const dataLine = lines.find((line) => line.startsWith('data:'))?.slice(5).trim() ?? '{}';

  return {
    event,
    data: JSON.parse(dataLine) as Record<string, unknown>,
  };
}

export async function getMe(user: AuthUser) {
  return apiFetch<{
    uid: string;
    email: string | null;
    emailVerified: boolean;
    name: string | null;
  } & ResponseMeta>('/api/me', user, { method: 'GET' });
}

export async function listAccessibleProjects(user: AuthUser) {
  return apiFetch<{
    projects: AccessibleProjectSummary[];
  } & ResponseMeta>('/api/projects', user, {
    method: 'GET',
  });
}

export async function bootstrapProject(user: AuthUser, name: string) {
  return apiFetch<BootstrapProjectResponse>('/api/dev/bootstrap-project', user, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function getWorkspace(user: AuthUser, projectId: string) {
  return apiFetch<{
    projectId: string;
  } & ResponseMeta>(`/api/projects/${projectId}/workspace`, user, { method: 'GET' });
}

export async function runAdminTest(user: AuthUser, projectId: string, message: string) {
  return apiFetch<AdminTestResponse>(`/api/projects/${projectId}/admin/test`, user, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export async function listProjectChannels(user: AuthUser, projectId: string) {
  return apiFetch<{
    channels: ChannelSummary[];
  } & ResponseMeta>(`/api/projects/${projectId}/channels`, user, {
    method: 'GET',
  });
}

export async function createProjectChannel(
  user: AuthUser,
  projectId: string,
  name: string,
  description?: string,
) {
  return apiFetch<{
    channel: ChannelSummary;
  } & ResponseMeta>(`/api/projects/${projectId}/channels`, user, {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });
}

export async function listChannelFeed(user: AuthUser, projectId: string, channelId: string) {
  return apiFetch<{
    channel: ChannelSummary;
    posts: ChannelFeedPost[];
  } & ResponseMeta>(`/api/projects/${projectId}/channels/${channelId}/feed`, user, {
    method: 'GET',
  });
}

export async function createChannelPost(
  user: AuthUser,
  projectId: string,
  channelId: string,
  message: string,
) {
  return apiFetch<{
    thread: ThreadSummary;
    rootMessage: ThreadMessage;
  } & ResponseMeta>(`/api/projects/${projectId}/channels/${channelId}/posts`, user, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export async function getChannelThread(
  user: AuthUser,
  projectId: string,
  channelId: string,
  threadId: string,
) {
  return apiFetch<ThreadDetails>(
    `/api/projects/${projectId}/channels/${channelId}/threads/${threadId}`,
    user,
    {
      method: 'GET',
    },
  );
}

export async function streamThreadReply(
  user: AuthUser,
  projectId: string,
  channelId: string,
  threadId: string,
  message: string | undefined,
  handlers: {
    onEvent(event: StreamEvent): void;
  },
) {
  const response = await fetch(
    `/api/projects/${projectId}/channels/${channelId}/threads/${threadId}/messages/stream`,
    {
      method: 'POST',
      headers: {
        ...(await buildHeaders(user)),
        'content-type': 'application/json',
      },
      body: JSON.stringify(typeof message === 'string' ? { message } : {}),
    },
  );

  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json')
      ? JSON.stringify(await response.json())
      : await response.text();

    throw new Error(`[${response.status}] ${payload}`);
  }

  if (!response.body) {
    throw new Error('Streaming response body was empty.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const chunk = await reader.read();

    if (chunk.done) {
      break;
    }

    buffer += decoder.decode(chunk.value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      const event = parseEventBlock(block);

      if (event) {
        handlers.onEvent(event);
      }
    }
  }

  const trailingEvent = parseEventBlock(buffer.trim());

  if (trailingEvent) {
    handlers.onEvent(trailingEvent);
  }
}
