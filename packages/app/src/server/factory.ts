import { Hono } from 'hono';
import { MastraServer } from '@mastra/hono';
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace';

import {
  bootstrapProjectForPrincipal,
  createChannelPostForPrincipal,
  createProjectChannelForPrincipal,
  createChannelThreadForPrincipal,
  createFirebaseTokenVerifier,
  createMastra,
  executeProjectAgent,
  getChannelThreadForPrincipal,
  listChannelFeedForPrincipal,
  listAccessibleProjectsForPrincipal,
  listChannelThreadsForPrincipal,
  listProjectChannelsForPrincipal,
  sendChannelMessageForPrincipal,
  streamChannelReplyForPrincipal,
  summarizeProjectDocsForPrincipal,
  runMindspaceSupervisorForPrincipal,
  listMindspaceMastraAgentsForPrincipal,
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
  databaseUrl?: string;
  mastra?: ReturnType<typeof createMastra>;
  mindspaceFactory?: MindspaceFactory;
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
      projectId: process.env.FIREBASE_PROJECT_ID ?? 'mindmap-aff6a',
    });
  const auth = createAuthMiddleware({ tokenVerifier });

  const mastra = params.mastra ?? createMastra(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/hono_workspace');
  const mindspaceFactory = params.mindspaceFactory ?? createLocalMindspaceFactory();
  const platformDeps = { mastra, mindspaceFactory };

  app.route('/', healthRoutes);
  app.get('/ready', (c) => c.json({ ok: true }));
  app.use('/api/*', auth);
  app.route('/api', meRoutes);
  app.get('/api/projects', async (c) => {
    const principal = c.get('principal');
    const result = await (params.listAccessibleProjects ?? listAccessibleProjectsForPrincipal)({
      firebaseUid: principal.uid,
    });

    return c.json(result);
  });
  app.route('/api/projects', projectsRoutes);
  app.post('/api/dev/bootstrap-project', async (c) => {
    const principal = c.get('principal');
    const body = await c.req.json<{ name?: string }>();
    const result = await (params.bootstrapProjectForPrincipal ?? bootstrapProjectForPrincipal)({
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
    const result = await (params.createProjectChannel ?? createProjectChannelForPrincipal)({
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
    const body = await c.req.json<{ message?: string }>();
    const streamInput = {
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      channelId: c.req.param('channelId'),
      threadId: c.req.param('threadId'),
      ...(typeof body.message === 'string' ? { message: body.message } : {}),
    };
    const stream = await (params.streamChannelReply ??
      ((input) => streamChannelReplyForPrincipal(input, platformDeps)))(streamInput);

    return createSseResponse(stream);
  });

  // Admin gate for /api/mastra/stored/* writes. Must be registered BEFORE the
  // MastraServer mount so it intercepts mutating methods first.
  const rawAllowlist = params.adminEmails ?? process.env.ADMIN_EMAILS;
  const adminAllowlist = (Array.isArray(rawAllowlist)
    ? rawAllowlist
    : (rawAllowlist ?? '').split(','))
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

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
