import { Hono } from 'hono';
import { MastraServer } from '@mastra/hono';

import {
  bootstrapProjectForPrincipal,
  createProjectChannelForPrincipal,
  createChannelThreadForPrincipal,
  createFirebaseTokenVerifier,
  createMastra,
  executeProjectAgent,
  getChannelThreadForPrincipal,
  listChannelThreadsForPrincipal,
  listProjectChannelsForPrincipal,
  sendChannelMessageForPrincipal,
} from '@hono-workspace/platform';

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
  workspaceRootPath: string;
  threadId: string;
  runId?: string;
  modelId?: string;
  text: string;
}>;

type AppFactoryParams = {
  databaseUrl?: string;
  mastra?: ReturnType<typeof createMastra>;
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
    workspaceRootPath: string;
    binding: {
      activeAgentRef: string;
      activeAgentVersion: string;
    };
    defaultChannelId: string;
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
    workspaceRootPath: string;
    threadId: string;
    runId?: string;
    modelId?: string;
    text: string;
  }>;
};

export async function createApp(params: AppFactoryParams = {}) {
  const app = new Hono<AppBindings>();
  const tokenVerifier =
    params.tokenVerifier ??
    createFirebaseTokenVerifier({
      projectId: process.env.FIREBASE_PROJECT_ID ?? 'mindmap-aff6a',
    });
  const auth = createAuthMiddleware({ tokenVerifier });

  const mastra = params.mastra ?? createMastra(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/hono_workspace');

  app.route('/', healthRoutes);
  app.get('/ready', (c) => c.json({ ok: true }));
  app.use('/api/*', auth);
  app.route('/api', meRoutes);
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
      ((input) => executeProjectAgent(input, { mastra })))({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      message: body.message ?? '',
    });

    return c.json({
      resourceId: result.resourceId,
      workspaceRootPath: result.workspaceRootPath,
      threadId: result.threadId,
      runId: result.runId,
      modelId: result.modelId,
      text: result.text,
    });
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
      ((input) => createChannelThreadForPrincipal(input, { mastra })))({
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
      ((input) => getChannelThreadForPrincipal(input, { mastra })))({
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
      ((input) => sendChannelMessageForPrincipal(input, { mastra })))({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      channelId: c.req.param('channelId'),
      threadId: c.req.param('threadId'),
      message: body.message ?? '',
    });

    return c.json(result);
  });

  const server = new MastraServer({ app, mastra });
  await server.init();

  return app;
}
