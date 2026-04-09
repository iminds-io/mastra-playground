type AuthUser = {
  getIdToken(): Promise<string>;
};

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
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`[${response.status}] ${JSON.stringify(payload)}`);
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
    __meta: { status: number; durationMs: number };
  }>('/api/me', user, { method: 'GET' });
}

export async function bootstrapProject(user: AuthUser, name: string) {
  return apiFetch<{
    projectId: string;
    organizationId: string;
    workspaceRootPath: string;
    binding: {
      activeAgentRef: string;
      activeAgentVersion: string;
    };
    __meta: { status: number; durationMs: number };
  }>('/api/dev/bootstrap-project', user, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function getWorkspace(user: AuthUser, projectId: string) {
  return apiFetch<{
    projectId: string;
    __meta: { status: number; durationMs: number };
  }>(`/api/projects/${projectId}/workspace`, user, { method: 'GET' });
}

export async function runAgent(user: AuthUser, projectId: string, message: string) {
  return apiFetch<{
    resourceId: string;
    workspaceRootPath: string;
    threadId: string;
    runId?: string;
    modelId?: string;
    text: string;
    __meta: { status: number; durationMs: number };
  }>(`/api/projects/${projectId}/agent/run`, user, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}
