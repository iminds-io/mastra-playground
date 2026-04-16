// ABOUTME: Cloudflare Worker entry point — boots the Hono app with
// ABOUTME: Neon serverless DB and R2-backed workspace filesystem.

import { Hono } from 'hono';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { S3Filesystem } from '@mastra/s3';
import { Workspace } from '@mastra/core/workspace';

import {
  setDatabasePool,
  setWorkspaceFactory,
  createMastra,
  createFirebaseTokenVerifier,
  bootstrapProjectForPrincipal,
  createChannelPostForPrincipal,
  createProjectChannelForPrincipal,
  createChannelThreadForPrincipal,
  executeProjectAgent,
  getChannelThreadForPrincipal,
  listChannelFeedForPrincipal,
  listAccessibleProjectsForPrincipal,
  listChannelThreadsForPrincipal,
  listProjectChannelsForPrincipal,
  sendChannelMessageForPrincipal,
  streamChannelReplyForPrincipal,
} from '@hono-workspace/platform';

type Env = {
  DATABASE_URL: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_TOKEN: string;
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL?: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  WORKSPACE_ROOT: string;
};

type Principal = {
  uid: string;
  email: string | null;
  name: string | null;
};

type HonoEnv = {
  Bindings: Env;
  Variables: {
    principal: Principal;
    mastra: ReturnType<typeof createMastra>;
  };
};

let booted = false;
let mastraInstance: ReturnType<typeof createMastra>;

function boot(env: Env) {
  if (booted) return;

  neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  setDatabasePool(pool);

  setWorkspaceFactory(async (basePath: string) => {
    const filesystem = new S3Filesystem({
      bucket: env.R2_BUCKET_NAME,
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      prefix: basePath,
    });
    const workspace = new Workspace({ filesystem });
    await workspace.init();
    return workspace;
  });

  mastraInstance = createMastra(env.DATABASE_URL, {
    openrouterApiKey: env.OPENROUTER_API_KEY,
    openrouterModel: env.OPENROUTER_MODEL,
  });

  booted = true;
}

const app = new Hono<HonoEnv>();

app.use('*', async (c, next) => {
  boot(c.env);
  c.set('mastra', mastraInstance);
  await next();
});

// Health routes (no auth)
app.get('/health', (c) => c.json({ status: 'ok' }));
app.get('/ready', (c) => c.json({ ok: true }));

// Auth middleware for /api/* routes
app.use('/api/*', async (c, next) => {
  const authorization = c.req.header('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing authorization header' }, 401);
  }

  const token = authorization.slice(7);
  const tokenVerifier = createFirebaseTokenVerifier({
    projectId: c.env.FIREBASE_PROJECT_ID,
  });

  try {
    const decoded = await tokenVerifier.verifyIdToken(token);
    c.set('principal', {
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: decoded.name ?? null,
    });
    await next();
  } catch (error) {
    console.error('[auth] token verification failed:', error);
    return c.json({ error: 'Invalid token' }, 401);
  }
});

app.get('/api/me', (c) => {
  const principal = c.get('principal');
  return c.json({ uid: principal.uid, email: principal.email, name: principal.name });
});

app.get('/api/projects', async (c) => {
  const principal = c.get('principal');
  const result = await listAccessibleProjectsForPrincipal({
    firebaseUid: principal.uid,
  });
  return c.json(result);
});

app.post('/api/dev/bootstrap-project', async (c) => {
  const principal = c.get('principal');
  const body = await c.req.json<{ name?: string }>();
  const result = await bootstrapProjectForPrincipal({
    uid: principal.uid,
    email: principal.email,
    name: principal.name,
    ...(body.name ? { projectName: body.name } : {}),
  });
  return c.json(result);
});

app.post('/api/projects/:projectId/admin/test', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const body = await c.req.json<{ message?: string }>();
  const result = await executeProjectAgent({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    message: body.message ?? '',
  }, { mastra });
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
  const result = await listProjectChannelsForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
  });
  return c.json(result);
});

app.post('/api/projects/:projectId/channels', async (c) => {
  const principal = c.get('principal');
  const body = await c.req.json<{ name?: string; description?: string }>();
  const result = await createProjectChannelForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    name: body.name ?? '',
    description: body.description ?? null,
  });
  return c.json(result);
});

app.get('/api/projects/:projectId/channels/:channelId/feed', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const result = await listChannelFeedForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    channelId: c.req.param('channelId'),
  }, { mastra });
  return c.json(result);
});

app.post('/api/projects/:projectId/channels/:channelId/posts', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const body = await c.req.json<{ message?: string }>();
  const result = await createChannelPostForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    channelId: c.req.param('channelId'),
    message: body.message ?? '',
  }, { mastra });
  return c.json(result);
});

app.get('/api/projects/:projectId/channels/:channelId/threads', async (c) => {
  const principal = c.get('principal');
  const result = await listChannelThreadsForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    channelId: c.req.param('channelId'),
  });
  return c.json(result);
});

app.post('/api/projects/:projectId/channels/:channelId/threads', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const body = await c.req.json<{ title?: string }>();
  const result = await createChannelThreadForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    channelId: c.req.param('channelId'),
    title: body.title ?? null,
  }, { mastra });
  return c.json(result);
});

app.get('/api/projects/:projectId/channels/:channelId/threads/:threadId', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const result = await getChannelThreadForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    channelId: c.req.param('channelId'),
    threadId: c.req.param('threadId'),
  }, { mastra });
  return c.json(result);
});

app.post('/api/projects/:projectId/channels/:channelId/threads/:threadId/messages', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const body = await c.req.json<{ message?: string }>();
  const result = await sendChannelMessageForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    channelId: c.req.param('channelId'),
    threadId: c.req.param('threadId'),
    message: body.message ?? '',
  }, { mastra });
  return c.json(result);
});

app.post('/api/projects/:projectId/channels/:channelId/threads/:threadId/messages/stream', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const body = await c.req.json<{ message?: string }>();
  const stream = await streamChannelReplyForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    channelId: c.req.param('channelId'),
    threadId: c.req.param('threadId'),
    ...(typeof body.message === 'string' ? { message: body.message } : {}),
  }, { mastra });

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
});

export default app;
