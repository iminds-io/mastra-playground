type AuthUser = {
  getIdToken(): Promise<string>;
};

type ResponseMeta = {
  __meta: {
    status: number;
    durationMs: number;
  };
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

export type ChatReply = {
  resourceId: string;
  workspaceRootPath: string;
  threadId: string;
  runId?: string;
  modelId?: string;
  text: string;
} & ResponseMeta;

async function apiFetch<T>(path: string, user: AuthUser, init?: RequestInit): Promise<T> {
  const token = await user.getIdToken();
  const startedAt = performance.now();
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      authorization: `Bearer ${token}`,
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

export async function getMe(user: AuthUser) {
  return apiFetch<{
    uid: string;
    email: string | null;
    emailVerified: boolean;
    name: string | null;
  } & ResponseMeta>('/api/me', user, { method: 'GET' });
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

export async function listChannelThreads(user: AuthUser, projectId: string, channelId: string) {
  return apiFetch<{
    threads: ThreadSummary[];
  } & ResponseMeta>(`/api/projects/${projectId}/channels/${channelId}/threads`, user, {
    method: 'GET',
  });
}

export async function createChannelThread(
  user: AuthUser,
  projectId: string,
  channelId: string,
  title?: string,
) {
  return apiFetch<{
    thread: ThreadSummary;
  } & ResponseMeta>(`/api/projects/${projectId}/channels/${channelId}/threads`, user, {
    method: 'POST',
    body: JSON.stringify({ title }),
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

export async function sendChannelMessage(
  user: AuthUser,
  projectId: string,
  channelId: string,
  threadId: string,
  message: string,
) {
  return apiFetch<ChatReply>(
    `/api/projects/${projectId}/channels/${channelId}/threads/${threadId}/messages`,
    user,
    {
      method: 'POST',
      body: JSON.stringify({ message }),
    },
  );
}
