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
  mindspaceRootPath: string;
  binding: {
    activeAgentRef: string;
    activeAgentVersion: string;
  };
  defaultChannelId: string;
  seedThread?: {
    threadId: string;
    channelId: string;
  };
  project?: AccessibleProjectSummary;
} & ResponseMeta;

export type AdminTestResponse = {
  resourceId: string;
  mindspaceRootPath: string;
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
  sendFailed?: boolean;
  retryText?: string;
};

export type ThreadDetails = {
  thread: ThreadSummary;
  messages: ThreadMessage[];
} & ResponseMeta;

export type SearchResult = {
  messageId: string;
  threadId: string;
  channelId: string;
  channelName: string;
  messageText: string;
  threadTitle: string | null;
  role: string;
  createdAt: string;
};

export type ProjectSettingsGeneral = {
  role: string;
  project: {
    id: string;
    organizationId: string;
    name: string;
    slug: string;
    status: string;
    createdAt: string;
  };
};

export type ProjectSettingsMember = {
  membershipId: string;
  userId: string;
  role: string;
  displayName: string;
  email: string | null;
};

export type ProjectSettingsInvitation = {
  id: string;
  email: string;
  role: string;
  status: string;
};

export type ProjectSettingsMembers = {
  role: string;
  members: ProjectSettingsMember[];
  invitations: ProjectSettingsInvitation[];
};

export type ProjectMindConfig = {
  id: string;
  project_id: string;
  agent_id: string;
  display_name: string;
  icon: string;
  blurb: string | null;
  enabled: boolean;
  prompt_override: string | null;
};

export type ProjectSettingsMinds = {
  role: string;
  minds: ProjectMindConfig[];
};

export type StreamEvent = {
  event: string;
  data: Record<string, unknown>;
};

export class StreamInterruptedError extends Error {
  partialText: string;

  constructor(partialText: string) {
    super('Stream interrupted before completion.');
    this.name = 'StreamInterruptedError';
    this.partialText = partialText;
  }
}

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

export async function getProjectSettingsGeneral(user: AuthUser, projectId: string) {
  return apiFetch<ProjectSettingsGeneral & ResponseMeta>(`/api/projects/${projectId}/settings/general`, user, {
    method: 'GET',
  });
}

export async function updateProjectSettingsGeneral(
  user: AuthUser,
  projectId: string,
  input: { name: string },
) {
  return apiFetch<{
    project: {
      id: string;
      organizationId: string;
      name: string;
      slug: string;
      status: string;
    };
  } & ResponseMeta>(`/api/projects/${projectId}/settings/general`, user, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function archiveProjectSettings(user: AuthUser, projectId: string) {
  return apiFetch<{
    project: {
      id: string;
      organizationId: string;
      name: string;
      slug: string;
      status: string;
    };
  } & ResponseMeta>(`/api/projects/${projectId}/settings/archive`, user, {
    method: 'POST',
  });
}

export async function listProjectSettingsMembers(user: AuthUser, projectId: string) {
  return apiFetch<ProjectSettingsMembers & ResponseMeta>(`/api/projects/${projectId}/settings/members`, user, {
    method: 'GET',
  });
}

export async function inviteProjectMember(
  user: AuthUser,
  projectId: string,
  input: { email: string; role: string },
) {
  return apiFetch<{
    invitation: {
      id: string;
      project_id: string;
      email: string;
      role: string;
      invited_by_user_id: string | null;
      status: string;
    };
    membership?: {
      id: string;
      project_id: string;
      user_id: string;
      role: string;
    };
  } & ResponseMeta>(`/api/projects/${projectId}/settings/members/invite`, user, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function removeProjectMember(user: AuthUser, projectId: string, membershipId: string) {
  return apiFetch<{
    membership: {
      id: string;
      project_id: string;
      user_id: string;
      role: string;
    } | null;
  } & ResponseMeta>(`/api/projects/${projectId}/settings/members/${membershipId}`, user, {
    method: 'DELETE',
  });
}

export async function listProjectMindConfigs(user: AuthUser, projectId: string) {
  return apiFetch<ProjectSettingsMinds & ResponseMeta>(`/api/projects/${projectId}/settings/minds`, user, {
    method: 'GET',
  });
}

export async function updateProjectMindConfig(
  user: AuthUser,
  projectId: string,
  mindId: string,
  input: {
    displayName?: string;
    icon?: string;
    blurb?: string | null;
    enabled?: boolean;
    promptOverride?: string | null;
  },
) {
  return apiFetch<{
    mind: ProjectMindConfig | null;
  } & ResponseMeta>(`/api/projects/${projectId}/settings/minds/${mindId}`, user, {
    method: 'PATCH',
    body: JSON.stringify(input),
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
    seedThread?: {
      threadId: string;
      channelId: string;
    };
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

export async function searchMessages(
  user: AuthUser,
  projectId: string,
  query: string,
  options?: { channelId?: string; page?: number },
) {
  const params = new URLSearchParams({ q: query });
  if (options?.channelId) {
    params.set('channelId', options.channelId);
  }
  if (options?.page !== undefined && options.page > 0) {
    params.set('page', String(options.page));
  }

  return apiFetch<{
    results: SearchResult[];
  } & ResponseMeta>(`/api/projects/${projectId}/search?${params}`, user, {
    method: 'GET',
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
  agentId?: string,
) {
  const response = await fetch(
    `/api/projects/${projectId}/channels/${channelId}/threads/${threadId}/messages/stream`,
    {
      method: 'POST',
      headers: {
        ...(await buildHeaders(user)),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        ...(typeof message === 'string' ? { message } : {}),
        ...(agentId ? { agentId } : {}),
      }),
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
  let partialText = '';
  let sawDone = false;

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
        if (event.event === 'token') {
          partialText += String(event.data.text ?? '');
        }
        if (event.event === 'done') {
          sawDone = true;
        }
        if (event.event === 'error') {
          throw new StreamInterruptedError(partialText);
        }
        handlers.onEvent(event);
      }
    }
  }

  const trailingEvent = parseEventBlock(buffer.trim());

  if (trailingEvent) {
    if (trailingEvent.event === 'token') {
      partialText += String(trailingEvent.data.text ?? '');
    }
    if (trailingEvent.event === 'done') {
      sawDone = true;
    }
    handlers.onEvent(trailingEvent);
  }

  if (!sawDone) {
    throw new StreamInterruptedError(partialText);
  }
}
