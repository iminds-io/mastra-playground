import { Hono } from 'hono';
import { MastraServer } from '@mastra/hono';
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace';

import {
  AccessDeniedError,
  ChannelEventEmitter,
  bootstrapProjectForPrincipal,
  createChannelPostAndStreamForPrincipal,
  createChannelPostForPrincipal,
  createProjectChannelForPrincipal,
  createChannelThreadForPrincipal,
  createFirebaseTokenVerifier,
  createMastra,
  executeProjectAgent,
  getChannelThreadForPrincipal,
  listChannelFeedForPrincipal,
  listAccessibleProjectsForPrincipal,
  listAllProjectsForAdmin,
  getSessionBootstrapForPrincipal,
  listChannelThreadsForPrincipal,
  listProjectChannelsForPrincipal,
  getProjectGeneralSettingsForPrincipal,
  updateProjectGeneralSettingsForPrincipal,
  archiveProjectForPrincipal,
  canAccessAdminConsole,
  listProjectSettingsMembersForPrincipal,
  inviteProjectMemberForPrincipal,
  removeProjectMemberForPrincipal,
  listProjectMindConfigsForPrincipal,
  updateProjectMindConfigForPrincipal,
  searchChannelMessagesForPrincipal,
  sendChannelMessageForPrincipal,
  streamChannelReplyForPrincipal,
  summarizeProjectDocsForPrincipal,
  runMindspaceSupervisorForPrincipal,
  listMindspaceMastraAgentsForPrincipal,
  normalizeAdminAllowlist,
  generateMindspaceMastraAgentForPrincipal,
  streamMindspaceMastraAgentForPrincipal,
  listMindspaceMastraWorkflowsForPrincipal,
  createMindspaceMastraWorkflowRunForPrincipal,
  startMindspaceMastraWorkflowForPrincipal,
  parseAgentVersionFromQuery,
  type MindspaceFactory,
} from '@mastra-mindspace/platform';

import { createAuthMiddleware, type AppBindings } from '../middleware/auth';
import { healthRoutes } from '../routes/health';
import { meRoutes } from '../routes/me';
import { projectsRoutes } from '../routes/projects';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

type ExecuteProjectAgent = (input: {
  firebaseUid: string;
  projectId: string;
  message: string;
}) => Promise<{
  resourceId: string;
  mindspaceRootPath: string;
  threadId: string;
  runId?: string;
  modelId?: string;
  text: string;
}>;

type StreamEvent = {
  event: string;
  data: Record<string, unknown>;
};

type MindspaceMastraListItem = {
  id: string;
  capability: 'read' | 'write';
  operations: string[];
};

type MindspaceMastraVersionDeps = {
  version?:
    | { versionId: string }
    | { status: 'draft' | 'published' };
};

type AppFactoryParams = {
  mastra?: ReturnType<typeof createMastra>;
  mindspaceFactory?: MindspaceFactory;
  channelEventEmitter?: ChannelEventEmitter;
  /**
   * Comma-separated emails (or array) allowed to mutate /api/mastra/stored/*.
   * Falls back to process.env.ADMIN_EMAILS when omitted. Reads stay open to
   * every authenticated caller.
   */
  adminEmails?: string[] | string;
  tokenVerifier?: {
    verifyIdToken(token: string): Promise<{
      uid: string;
      email: string | null;
      emailVerified: boolean;
      name: string | null;
      picture: string | null;
      authTime: number | null;
      rawClaims: Record<string, unknown>;
    }>;
  };
  executeProjectAgent?: ExecuteProjectAgent;
  bootstrapProjectForPrincipal?: (input: {
    uid: string;
    email: string | null;
    name: string | null;
    projectName?: string;
  }) => Promise<{
    projectId: string;
    organizationId: string;
    mindspaceRootPath: string;
    project?: {
      id: string;
      organizationId: string;
      name: string;
      slug: string;
      status: string;
    };
    binding: {
      activeAgentRef: string;
      activeAgentVersion: string;
    };
    defaultChannelId: string;
    seedThread?: {
      threadId: string;
      channelId: string;
    };
  }>;
  listAccessibleProjects?: (input: {
    firebaseUid: string;
  }) => Promise<{
    projects: Array<{
      id: string;
      organizationId: string;
      name: string;
      slug: string;
      status: string;
    }>;
  }>;
  listAdminProjects?: () => Promise<{
    projects: Array<{
      id: string;
      organizationId: string;
      name: string;
      slug: string;
      status: string;
    }>;
  }>;
  getSessionBootstrap?: (input: {
    uid: string;
    email: string | null;
    name: string | null;
    adminEmails?: string[] | string;
  }) => Promise<{
    me: {
      uid: string;
      email: string | null;
      name: string | null;
    };
    capabilities: {
      canAccessAdminConsole: boolean;
    };
    projects: Array<{
      id: string;
      organizationId: string;
      name: string;
      slug: string;
      status: string;
    }>;
    preferredProjectId: string | null;
  }>;
  getProjectSettingsGeneral?: (input: {
    firebaseUid: string;
    projectId: string;
  }) => Promise<{
    role: string;
    project: {
      id: string;
      organizationId: string;
      name: string;
      slug: string;
      status: string;
      createdAt: string;
    };
  }>;
  updateProjectSettingsGeneral?: (input: {
    firebaseUid: string;
    projectId: string;
    name: string;
  }) => Promise<{
    project: {
      id: string;
      organizationId: string;
      name: string;
      slug: string;
      status: string;
    };
  }>;
  archiveProjectSettings?: (input: {
    firebaseUid: string;
    projectId: string;
  }) => Promise<{
    project: {
      id: string;
      organizationId: string;
      name: string;
      slug: string;
      status: string;
    };
  }>;
  listProjectSettingsMembers?: (input: {
    firebaseUid: string;
    projectId: string;
  }) => Promise<{
    role: string;
    members: Array<{
      membershipId: string;
      userId: string;
      role: string;
      displayName: string;
      email: string | null;
    }>;
    invitations: Array<{
      id: string;
      email: string;
      role: string;
      status: string;
    }>;
  }>;
  inviteProjectMember?: (input: {
    firebaseUid: string;
    projectId: string;
    email: string;
    role: string;
  }) => Promise<{
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
  }>;
  removeProjectMember?: (input: {
    firebaseUid: string;
    projectId: string;
    membershipId: string;
  }) => Promise<{
    membership: {
      id: string;
      project_id: string;
      user_id: string;
      role: string;
    } | null;
  }>;
  listProjectMindConfigs?: (input: {
    firebaseUid: string;
    projectId: string;
  }) => Promise<{
    role: string;
    minds: Array<{
      id: string;
      project_id: string;
      agent_id: string;
      display_name: string;
      icon: string;
      blurb: string | null;
      enabled: boolean;
      prompt_override: string | null;
    }>;
  }>;
  updateProjectMindConfig?: (input: {
    firebaseUid: string;
    projectId: string;
    mindId: string;
    displayName?: string;
    icon?: string;
    blurb?: string | null;
    enabled?: boolean;
    promptOverride?: string | null;
  }) => Promise<{
    mind: {
      id: string;
      project_id: string;
      agent_id: string;
      display_name: string;
      icon: string;
      blurb: string | null;
      enabled: boolean;
      prompt_override: string | null;
    } | null;
  }>;
  listProjectChannels?: (input: {
    firebaseUid: string;
    projectId: string;
  }) => Promise<{
    channels: Array<{
      id: string;
      name: string;
      slug: string;
    }>;
  }>;
  createProjectChannel?: (input: {
    firebaseUid: string;
    projectId: string;
    name: string;
    description?: string | null;
  }) => Promise<{
    channel: {
      id: string;
      name: string;
      slug: string;
      description?: string | null;
      kind?: string;
      isPrivate?: boolean;
    };
    seedThread?: {
      threadId: string;
      channelId: string;
    };
  }>;
  listChannelFeed?: (input: {
    firebaseUid: string;
    projectId: string;
    channelId: string;
  }) => Promise<{
    channel: {
      id: string;
      name: string;
      slug: string;
    };
    posts: Array<{
      threadId: string;
      rootMessageId: string;
      rootMessageText: string;
      rootMessageRole: string;
      replyCount: number;
      lastMessageAt: string | null;
      createdAt: string;
    }>;
  }>;
  createChannelPost?: (input: {
    firebaseUid: string;
    projectId: string;
    channelId: string;
    message: string;
  }) => Promise<{
    thread: {
      id: string;
      channelId: string;
      title: string | null;
      lastMessageAt?: string | null;
      createdAt?: string;
      updatedAt?: string;
    };
    rootMessage: {
      id: string;
      role: string;
      text: string;
      createdAt: string;
    };
  }>;
  createChannelPostAndStream?: (input: {
    firebaseUid: string;
    projectId: string;
    channelId: string;
    message: string;
    agentId?: string;
  }) => AsyncGenerator<{
    event: string;
    data: Record<string, unknown>;
  }>;
  searchChannelMessages?: (input: {
    firebaseUid: string;
    projectId: string;
    query: string;
    channelId?: string;
    page?: number;
  }) => Promise<{
    results: Array<{
      messageId: string;
      threadId: string;
      channelId: string;
      channelName: string;
      messageText: string;
      threadTitle: string | null;
      role: string;
      createdAt: string;
    }>;
  }>;
  listChannelThreads?: (input: {
    firebaseUid: string;
    projectId: string;
    channelId: string;
  }) => Promise<{
    threads: Array<{
      id: string;
      channelId: string;
      title: string | null;
      lastMessageAt?: string | null;
      createdAt?: string;
      updatedAt?: string;
    }>;
  }>;
  createChannelThread?: (input: {
    firebaseUid: string;
    projectId: string;
    channelId: string;
    title?: string | null;
  }) => Promise<{
    thread: {
      id: string;
      channelId: string;
      title: string | null;
      lastMessageAt?: string | null;
      createdAt?: string;
      updatedAt?: string;
    };
  }>;
  getChannelThread?: (input: {
    firebaseUid: string;
    projectId: string;
    channelId: string;
    threadId: string;
  }) => Promise<{
    thread: {
      id: string;
      channelId: string;
      title: string | null;
      lastMessageAt?: string | null;
      createdAt?: string;
      updatedAt?: string;
    };
    messages: Array<{
      id: string;
      role: string;
      text: string;
      createdAt: string;
    }>;
  }>;
  sendChannelMessage?: (input: {
    firebaseUid: string;
    projectId: string;
    channelId: string;
    threadId: string;
    message: string;
  }) => Promise<{
    resourceId: string;
    mindspaceRootPath: string;
    threadId: string;
    runId?: string;
    modelId?: string;
    text: string;
  }>;
  streamChannelReply?: (input: {
    firebaseUid: string;
    projectId: string;
    channelId: string;
    threadId: string;
    message?: string;
    agentId?: string;
  }) => AsyncIterable<StreamEvent> | Promise<AsyncIterable<StreamEvent>>;
  summarizeProjectDocs?: (
    input: {
      firebaseUid: string;
      projectId: string;
      paths: string[];
      question?: string;
    },
    deps?: {
      version?:
        | { versionId: string }
        | { status: 'draft' | 'published' };
    },
  ) => Promise<{
    projectId: string;
    paths: string[];
    text: string;
    runId?: string;
    modelId?: string;
  }>;
  runMindspaceSupervisor?: (
    input: {
      firebaseUid: string;
      projectId: string;
      prompt: string;
      paths?: string[];
    },
    deps?: {
      version?:
        | { versionId: string }
        | { status: 'draft' | 'published' };
    },
  ) => Promise<{
    projectId: string;
    text: string;
    runId?: string;
    modelId?: string;
  }>;
  listWorkspaceMastraAgents?: (input: {
    firebaseUid: string;
    projectId: string;
  }) => Promise<{
    projectId: string;
    agents: MindspaceMastraListItem[];
  }>;
  generateWorkspaceMastraAgent?: (
    input: {
      firebaseUid: string;
      projectId: string;
      agentId: string;
      messages: string;
      threadId?: string;
    },
    deps?: MindspaceMastraVersionDeps,
  ) => Promise<{
    projectId: string;
    agentId: string;
    threadId: string;
    resourceId: string;
    text: string;
    runId?: string;
    modelId?: string;
  }>;
  streamWorkspaceMastraAgent?: (
    input: {
      firebaseUid: string;
      projectId: string;
      agentId: string;
      messages: string;
      threadId?: string;
    },
    deps?: MindspaceMastraVersionDeps,
  ) => AsyncIterable<StreamEvent> | Promise<AsyncIterable<StreamEvent>>;
  listWorkspaceMastraWorkflows?: (input: {
    firebaseUid: string;
    projectId: string;
  }) => Promise<{
    projectId: string;
    workflows: MindspaceMastraListItem[];
  }>;
  createWorkspaceMastraWorkflowRun?: (input: {
    firebaseUid: string;
    projectId: string;
    workflowId: string;
  }) => Promise<{
    projectId: string;
    workflowId: string;
    runId: string;
  }>;
  startWorkspaceMastraWorkflow?: (input: {
    firebaseUid: string;
    projectId: string;
    workflowId: string;
    runId?: string;
    inputData?: unknown;
    threadId?: string;
  }) => Promise<Record<string, unknown>>;
};

function createLocalMindspaceFactory(): MindspaceFactory {
  return async (basePath: string) => {
    const workspace = new Workspace({
      filesystem: new LocalFilesystem({
        basePath,
        contained: true,
      }),
      sandbox: new LocalSandbox({
        workingDirectory: basePath,
        env: {
          PATH: process.env.PATH ?? '',
        },
      }),
    });

    await workspace.init();

    return workspace;
  };
}

function createSseResponse(stream: AsyncIterable<StreamEvent>) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            controller.enqueue(
              encoder.encode(`event: ${chunk.event}\ndata: ${JSON.stringify(chunk.data)}\n\n`),
            );
          }
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({
                error: error instanceof Error ? error.message : 'Internal Server Error',
              })}\n\n`,
            ),
          );
        } finally {
          controller.close();
        }
      },
    }),
    {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      },
    },
  );
}

export async function createApp(params: AppFactoryParams = {}) {
  const app = new Hono<AppBindings>();
  app.onError((error, c) => {
    console.error(error);
    if (error instanceof AccessDeniedError) {
      return c.json(
        {
          error: error.message,
        },
        403,
      );
    }
    return c.json(
      {
        error: 'Internal Server Error',
      },
      500,
    );
  });

  const tokenVerifier =
    params.tokenVerifier ??
    createFirebaseTokenVerifier({
      projectId: requireEnv('FIREBASE_PROJECT_ID'),
    });
  const auth = createAuthMiddleware({ tokenVerifier });

  const mastra = params.mastra ?? createMastra(requireEnv('DATABASE_URL'));
  const mindspaceFactory = params.mindspaceFactory ?? createLocalMindspaceFactory();
  const channelEventEmitter = params.channelEventEmitter ?? new ChannelEventEmitter();
  const platformDeps = { mastra, mindspaceFactory, channelEventEmitter };

  app.route('/', healthRoutes);
  app.get('/ready', (c) => c.json({ ok: true }));
  app.get('/api/projects/:projectId/channels/:channelId/events', async (c) => {
    const token = c.req.query('token');
    if (!token) {
      return c.json({ error: 'Missing token query parameter' }, 401);
    }

    let principal: { uid: string; email: string | null; name: string | null };
    try {
      const decoded = await tokenVerifier.verifyIdToken(token);
      principal = {
        uid: decoded.uid,
        email: decoded.email ?? null,
        name: decoded.name ?? null,
      };
    } catch {
      return c.json({ error: 'Invalid token' }, 401);
    }

    const projectId = c.req.param('projectId');
    const channelId = c.req.param('channelId');
    const access = await (params.listProjectChannels ?? listProjectChannelsForPrincipal)({
      firebaseUid: principal.uid,
      projectId,
    });

    if (!access.channels.some((channel) => channel.id === channelId)) {
      return c.json({ error: 'Channel not found' }, 404);
    }

    const encoder = new TextEncoder();
    let unsubscribe = () => {};
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(`event: connected\ndata: ${JSON.stringify({ channelId })}\n\n`),
          );

          unsubscribe = channelEventEmitter.subscribe(channelId, (event) => {
            controller.enqueue(
              encoder.encode(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`),
            );
          });

          heartbeat = setInterval(() => {
            controller.enqueue(encoder.encode(`event: heartbeat\ndata: {}\n\n`));
          }, 30_000);
        },
        cancel() {
          unsubscribe();
          if (heartbeat) {
            clearInterval(heartbeat);
          }
        },
      }),
      {
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
        },
      },
    );
  });
  app.use('/api/*', auth);
  app.route('/api', meRoutes);
  app.get('/api/projects/:projectId/settings/general', async (c) => {
    const principal = c.get('principal');
    const result = await (params.getProjectSettingsGeneral ?? getProjectGeneralSettingsForPrincipal)({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
    });

    return c.json(result);
  });
  app.patch('/api/projects/:projectId/settings/general', async (c) => {
    const principal = c.get('principal');
    const body = await c.req.json<{ name?: string }>();
    const result = await (params.updateProjectSettingsGeneral ?? updateProjectGeneralSettingsForPrincipal)({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      name: body.name ?? '',
    });

    return c.json(result);
  });
  app.post('/api/projects/:projectId/settings/archive', async (c) => {
    const principal = c.get('principal');
    const result = await (params.archiveProjectSettings ?? archiveProjectForPrincipal)({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
    });

    return c.json(result);
  });
  app.get('/api/projects/:projectId/settings/members', async (c) => {
    const principal = c.get('principal');
    const result = await (params.listProjectSettingsMembers ?? listProjectSettingsMembersForPrincipal)({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
    });

    return c.json(result);
  });
  app.post('/api/projects/:projectId/settings/members/invite', async (c) => {
    const principal = c.get('principal');
    const body = await c.req.json<{ email?: string; role?: string }>();
    const result = await (params.inviteProjectMember ?? inviteProjectMemberForPrincipal)({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      email: body.email ?? '',
      role: body.role ?? 'member',
    });

    return c.json(result);
  });
  app.delete('/api/projects/:projectId/settings/members/:membershipId', async (c) => {
    const principal = c.get('principal');
    const result = await (params.removeProjectMember ?? removeProjectMemberForPrincipal)({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      membershipId: c.req.param('membershipId'),
    });

    return c.json(result);
  });
  app.get('/api/projects/:projectId/settings/minds', async (c) => {
    const principal = c.get('principal');
    const result = await (params.listProjectMindConfigs ?? listProjectMindConfigsForPrincipal)({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
    });

    return c.json(result);
  });
  app.patch('/api/projects/:projectId/settings/minds/:mindId', async (c) => {
    const principal = c.get('principal');
    const body = await c.req.json<{
      displayName?: string;
      icon?: string;
      blurb?: string | null;
      enabled?: boolean;
      promptOverride?: string | null;
    }>();
    const result = await (params.updateProjectMindConfig ?? updateProjectMindConfigForPrincipal)({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      mindId: c.req.param('mindId'),
      ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
      ...(body.icon !== undefined ? { icon: body.icon } : {}),
      ...(body.blurb !== undefined ? { blurb: body.blurb } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.promptOverride !== undefined ? { promptOverride: body.promptOverride } : {}),
    });

    return c.json(result);
  });
  app.get('/api/projects', async (c) => {
    const principal = c.get('principal');
    const result = await (params.listAccessibleProjects ?? listAccessibleProjectsForPrincipal)({
      firebaseUid: principal.uid,
    });

    return c.json(result);
  });
  app.get('/api/session/bootstrap', async (c) => {
    const principal = c.get('principal');
    const adminEmails = params.adminEmails ?? process.env.ADMIN_EMAILS;
    const bootstrapInput = adminEmails
      ? {
          uid: principal.uid,
          email: principal.email,
          name: principal.name,
          adminEmails,
        }
      : {
          uid: principal.uid,
          email: principal.email,
          name: principal.name,
        };
    const result = await (params.getSessionBootstrap ?? getSessionBootstrapForPrincipal)(bootstrapInput);

    return c.json(result);
  });
  app.get('/api/dev/projects', async (c) => {
    const principal = c.get('principal');
    if (
      !canAccessAdminConsole({
        email: principal.email,
        adminEmails: params.adminEmails ?? process.env.ADMIN_EMAILS,
      })
    ) {
      return c.json({ error: 'Admin access required for dev project listing' }, 403);
    }

    const result = await (params.listAdminProjects ?? listAllProjectsForAdmin)();
    return c.json(result);
  });
  app.route('/api/projects', projectsRoutes);
  app.post('/api/dev/bootstrap-project', async (c) => {
    const principal = c.get('principal');
    const body = await c.req.json<{ name?: string }>();
    const result = await (params.bootstrapProjectForPrincipal ?? ((input) => bootstrapProjectForPrincipal(input, { mastra })))({
      uid: principal.uid,
      email: principal.email,
      name: principal.name,
      ...(body.name ? { projectName: body.name } : {}),
    });

    return c.json(result);
  });
  app.post('/api/projects/:projectId/admin/test', async (c) => {
    const principal = c.get('principal');
    const body = await c.req.json<{ message?: string }>();
    const result = await (params.executeProjectAgent ??
      ((input) => executeProjectAgent(input, platformDeps)))({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      message: body.message ?? '',
    });

    return c.json({
      resourceId: result.resourceId,
      mindspaceRootPath: result.mindspaceRootPath,
      threadId: result.threadId,
      runId: result.runId,
      modelId: result.modelId,
      text: result.text,
    });
  });
  app.post('/api/projects/:projectId/summarize', async (c) => {
    const principal = c.get('principal');
    const body = await c.req.json<{ paths?: string[]; question?: string }>();
    const version = parseAgentVersionFromQuery({
      get: (name: string) => c.req.query(name) ?? null,
    });
    const summarizeInput = {
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      paths: body.paths ?? [],
      ...(body.question ? { question: body.question } : {}),
    };
    const depArg = version ? { version } : undefined;
    const result = params.summarizeProjectDocs
      ? await params.summarizeProjectDocs(summarizeInput, depArg)
      : await summarizeProjectDocsForPrincipal(summarizeInput, {
          ...platformDeps,
          ...(version ? { version } : {}),
        });

    return c.json(result);
  });
  app.post('/api/projects/:projectId/supervise', async (c) => {
    const principal = c.get('principal');
    const body = await c.req.json<{ prompt?: string; paths?: string[] }>();
    const version = parseAgentVersionFromQuery({
      get: (name: string) => c.req.query(name) ?? null,
    });
    const supervisorInput = {
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      prompt: body.prompt ?? '',
      ...(Array.isArray(body.paths) ? { paths: body.paths } : {}),
    };
    const depArg = version ? { version } : undefined;
    const result = params.runMindspaceSupervisor
      ? await params.runMindspaceSupervisor(supervisorInput, depArg)
      : await runMindspaceSupervisorForPrincipal(supervisorInput, {
          ...platformDeps,
          ...(version ? { version } : {}),
        });

    return c.json(result);
  });
  app.get('/api/projects/:projectId/mastra/agents', async (c) => {
    const principal = c.get('principal');
    const input = {
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
    };
    const result = params.listWorkspaceMastraAgents
      ? await params.listWorkspaceMastraAgents(input)
      : await listMindspaceMastraAgentsForPrincipal(input, platformDeps);

    return c.json(result);
  });
  app.post('/api/projects/:projectId/mastra/agents/:agentId/generate', async (c) => {
    const principal = c.get('principal');
    const body = await c.req.json<{ messages?: string; threadId?: string }>();
    const version = parseAgentVersionFromQuery({
      get: (name: string) => c.req.query(name) ?? null,
    });
    const input = {
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      agentId: c.req.param('agentId'),
      messages: body.messages ?? '',
      ...(body.threadId ? { threadId: body.threadId } : {}),
    };
    const depArg = version ? { version } : undefined;
    const result = params.generateWorkspaceMastraAgent
      ? await params.generateWorkspaceMastraAgent(input, depArg)
      : await generateMindspaceMastraAgentForPrincipal(input, {
          ...platformDeps,
          ...(version ? { version } : {}),
        });

    return c.json(result);
  });
  app.post('/api/projects/:projectId/mastra/agents/:agentId/stream', async (c) => {
    const principal = c.get('principal');
    const body = await c.req.json<{ messages?: string; threadId?: string }>();
    const version = parseAgentVersionFromQuery({
      get: (name: string) => c.req.query(name) ?? null,
    });
    const input = {
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      agentId: c.req.param('agentId'),
      messages: body.messages ?? '',
      ...(body.threadId ? { threadId: body.threadId } : {}),
    };
    const depArg = version ? { version } : undefined;
    const stream = params.streamWorkspaceMastraAgent
      ? await params.streamWorkspaceMastraAgent(input, depArg)
      : streamMindspaceMastraAgentForPrincipal(input, {
          ...platformDeps,
          ...(version ? { version } : {}),
        });

    return createSseResponse(stream);
  });
  app.get('/api/projects/:projectId/mastra/workflows', async (c) => {
    const principal = c.get('principal');
    const input = {
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
    };
    const result = params.listWorkspaceMastraWorkflows
      ? await params.listWorkspaceMastraWorkflows(input)
      : await listMindspaceMastraWorkflowsForPrincipal(input, platformDeps);

    return c.json(result);
  });
  app.post('/api/projects/:projectId/mastra/workflows/:workflowId/create-run', async (c) => {
    const principal = c.get('principal');
    const input = {
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      workflowId: c.req.param('workflowId'),
    };
    const result = params.createWorkspaceMastraWorkflowRun
      ? await params.createWorkspaceMastraWorkflowRun(input)
      : await createMindspaceMastraWorkflowRunForPrincipal(input, platformDeps);

    return c.json(result);
  });
  app.post('/api/projects/:projectId/mastra/workflows/:workflowId/start', async (c) => {
    const principal = c.get('principal');
    const body = await c.req.json<{ runId?: string; inputData?: unknown; threadId?: string }>();
    const input = {
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      workflowId: c.req.param('workflowId'),
      ...(body.runId ? { runId: body.runId } : {}),
      ...(body.threadId ? { threadId: body.threadId } : {}),
      inputData: body.inputData,
    };
    const result = params.startWorkspaceMastraWorkflow
      ? await params.startWorkspaceMastraWorkflow(input)
      : await startMindspaceMastraWorkflowForPrincipal(input, platformDeps);

    return c.json(result);
  });
  app.get('/api/projects/:projectId/channels', async (c) => {
    const principal = c.get('principal');
    const result = await (params.listProjectChannels ?? listProjectChannelsForPrincipal)({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
    });

    return c.json(result);
  });
  app.post('/api/projects/:projectId/channels', async (c) => {
    const principal = c.get('principal');
    const body = await c.req.json<{ name?: string; description?: string }>();
    const result = await (params.createProjectChannel ?? ((input) => createProjectChannelForPrincipal(input, platformDeps)))({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      name: body.name ?? '',
      description: body.description ?? null,
    });

    return c.json(result);
  });
  app.get('/api/projects/:projectId/channels/:channelId/feed', async (c) => {
    const principal = c.get('principal');
    const result = await (params.listChannelFeed ??
      ((input) => listChannelFeedForPrincipal(input, platformDeps)))({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      channelId: c.req.param('channelId'),
    });

    return c.json(result);
  });
  app.get('/api/projects/:projectId/search', async (c) => {
    const principal = c.get('principal');
    const q = c.req.query('q') ?? '';
    const channelId = c.req.query('channelId') ?? undefined;
    const pageValue = c.req.query('page');
    const parsedPage = pageValue ? Number.parseInt(pageValue, 10) : undefined;
    const page = Number.isFinite(parsedPage) && (parsedPage ?? 0) >= 0 ? parsedPage : undefined;
    const result = await (params.searchChannelMessages ?? searchChannelMessagesForPrincipal)({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      query: q,
      ...(channelId ? { channelId } : {}),
      ...(page !== undefined ? { page } : {}),
    });

    return c.json(result);
  });
  app.post('/api/projects/:projectId/channels/:channelId/posts', async (c) => {
    const principal = c.get('principal');
    const body = await c.req.json<{ message?: string }>();
    const result = await (params.createChannelPost ??
      ((input) => createChannelPostForPrincipal(input, platformDeps)))({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      channelId: c.req.param('channelId'),
      message: body.message ?? '',
    });

    return c.json(result);
  });
  app.post('/api/projects/:projectId/channels/:channelId/posts/stream', async (c) => {
    const principal = c.get('principal');
    const body = await c.req.json<{ message?: string; agentId?: string }>();
    const stream = await (params.createChannelPostAndStream ??
      ((input) => createChannelPostAndStreamForPrincipal(input, platformDeps)))({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      channelId: c.req.param('channelId'),
      message: body.message ?? '',
      ...(typeof body.agentId === 'string' ? { agentId: body.agentId } : {}),
    });

    return createSseResponse(stream);
  });
  app.get('/api/projects/:projectId/channels/:channelId/threads', async (c) => {
    const principal = c.get('principal');
    const result = await (params.listChannelThreads ??
      ((input) => listChannelThreadsForPrincipal(input)))({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      channelId: c.req.param('channelId'),
    });

    return c.json(result);
  });
  app.post('/api/projects/:projectId/channels/:channelId/threads', async (c) => {
    const principal = c.get('principal');
    const body = await c.req.json<{ title?: string }>();
    const result = await (params.createChannelThread ??
      ((input) => createChannelThreadForPrincipal(input, platformDeps)))({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      channelId: c.req.param('channelId'),
      title: body.title ?? null,
    });

    return c.json(result);
  });
  app.get('/api/projects/:projectId/channels/:channelId/threads/:threadId', async (c) => {
    const principal = c.get('principal');
    const result = await (params.getChannelThread ??
      ((input) => getChannelThreadForPrincipal(input, platformDeps)))({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      channelId: c.req.param('channelId'),
      threadId: c.req.param('threadId'),
    });

    return c.json(result);
  });
  app.post('/api/projects/:projectId/channels/:channelId/threads/:threadId/messages', async (c) => {
    const principal = c.get('principal');
    const body = await c.req.json<{ message?: string }>();
    const result = await (params.sendChannelMessage ??
      ((input) => sendChannelMessageForPrincipal(input, platformDeps)))({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      channelId: c.req.param('channelId'),
      threadId: c.req.param('threadId'),
      message: body.message ?? '',
    });

    return c.json(result);
  });
  app.post('/api/projects/:projectId/channels/:channelId/threads/:threadId/messages/stream', async (c) => {
    const principal = c.get('principal');
    const body = await c.req.json<{ message?: string; agentId?: string }>();
    const streamInput = {
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      channelId: c.req.param('channelId'),
      threadId: c.req.param('threadId'),
      ...(typeof body.message === 'string' ? { message: body.message } : {}),
      ...(typeof body.agentId === 'string' ? { agentId: body.agentId } : {}),
    };
    const stream = await (params.streamChannelReply ??
      ((input) => streamChannelReplyForPrincipal(input, platformDeps)))(streamInput);

    return createSseResponse(stream);
  });

  // Admin gate for /api/mastra/stored/* writes. Must be registered BEFORE the
  // MastraServer mount so it intercepts mutating methods first.
  const rawAllowlist = params.adminEmails ?? process.env.ADMIN_EMAILS;
  const adminAllowlist = normalizeAdminAllowlist(rawAllowlist);

  app.use('/api/mastra/stored/*', async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return next();
    }
    const principal = c.get('principal');
    const email = principal?.email?.toLowerCase() ?? '';
    if (!email || !adminAllowlist.includes(email)) {
      return c.json({ error: 'Admin access required for stored-agent mutations' }, 403);
    }
    await next();
  });

  // Cast to relax the generic Mastra<...> returned by createMastra down to the
  // base Mastra class expected by MastraServer. TS can't reconcile the private
  // fields across the two generics even though it's the same class at runtime.
  const server = new MastraServer({ app, mastra: mastra as never, prefix: '/api/mastra' });
  await server.init();

  return app;
}
