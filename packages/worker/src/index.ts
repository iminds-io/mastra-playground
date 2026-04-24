// ABOUTME: Cloudflare Worker entry point — boots the Hono app with
// ABOUTME: Neon serverless DB and R2-backed mindspace filesystem.

import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { S3Filesystem } from '@mastra/s3';
import { Workspace } from '@mastra/core/workspace';

import {
  setDatabasePool,
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
  MINDSPACE_ROOT: string;
  // Comma-separated list of Firebase emails allowed to mutate editor endpoints
  // (/api/mastra/stored/*). When empty or unset, write methods are rejected for
  // every authenticated caller. Read methods (GET/HEAD) stay available to all
  // authenticated callers.
  ADMIN_EMAILS?: string;
};

type Principal = {
  uid: string;
  email: string | null;
  name: string | null;
};

type StreamEvent = {
  event: string;
  data: Record<string, unknown>;
};

type HonoEnv = {
  Bindings: Env;
  Variables: {
    principal: Principal;
    mastra: ReturnType<typeof createMastra>;
    mindspaceFactory: MindspaceFactory;
  };
};

// Create a fresh DatabasePool adapter backed by @neondatabase/serverless's HTTP client.
// Each call is a stateless HTTP query, so the adapter can be created per request
// (required by CF Workers, which forbid sharing I/O objects across requests).
function createNeonHttpPool(connectionString: string) {
  const sql = neon(connectionString);
  return {
    async query<T = any>(text: string, values?: unknown[]) {
      const rows = (await sql.query(text, values)) as T[];
      return { rows, rowCount: rows.length };
    },
  };
}

function bootRequest(env: Env) {
  setDatabasePool(createNeonHttpPool(env.DATABASE_URL));

  const mindspaceFactory: MindspaceFactory = async (basePath: string) => {
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
  };

  const mastra = createMastra(env.DATABASE_URL, {
    openrouterApiKey: env.OPENROUTER_API_KEY,
    openrouterModel: env.OPENROUTER_MODEL,
  });

  return { mastra, mindspaceFactory };
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

const app = new Hono<HonoEnv>();

app.use('*', async (c, next) => {
  const deps = bootRequest(c.env);
  c.set('mastra', deps.mastra);
  c.set('mindspaceFactory', deps.mindspaceFactory);
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

// Admin gate for /api/mastra/stored/* writes. Reads stay available to all
// authenticated callers so clients can inspect stored-agent versions without
// elevated privilege. Mutating methods require the caller's verified email to
// be in the ADMIN_EMAILS allowlist.
app.use('/api/mastra/stored/*', async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  const principal = c.get('principal');
  const allowlist = (c.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  const email = principal.email?.toLowerCase() ?? '';
  if (!email || !allowlist.includes(email)) {
    return c.json({ error: 'Admin access required for stored-agent mutations' }, 403);
  }

  await next();
});

app.use('/api/mastra/*', async (c) => {
  const { MastraServer } = await import('@mastra/hono');
  const mastra = c.get('mastra');
  const subApp = new Hono<HonoEnv>();
  const server = new MastraServer({ app: subApp, mastra, prefix: '' });
  await server.init();

  const url = new URL(c.req.raw.url);
  url.pathname = url.pathname.replace(/^\/api\/mastra/, '') || '/';
  const forwarded = new Request(url.toString(), c.req.raw);

  return subApp.fetch(forwarded, c.env, c.executionCtx);
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
  const mindspaceFactory = c.get('mindspaceFactory');
  const body = await c.req.json<{ message?: string }>();
  const result = await executeProjectAgent({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    message: body.message ?? '',
  }, { mastra, mindspaceFactory });
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
  const mastra = c.get('mastra');
  const mindspaceFactory = c.get('mindspaceFactory');
  const body = await c.req.json<{ paths?: string[]; question?: string }>();
  const version = parseAgentVersionFromQuery({
    get: (name: string) => c.req.query(name) ?? null,
  });
  const result = await summarizeProjectDocsForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    paths: body.paths ?? [],
    ...(body.question ? { question: body.question } : {}),
  }, { mastra, mindspaceFactory, ...(version ? { version } : {}) });
  return c.json(result);
});

app.post('/api/projects/:projectId/supervise', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const mindspaceFactory = c.get('mindspaceFactory');
  const body = await c.req.json<{ prompt?: string; paths?: string[] }>();
  const version = parseAgentVersionFromQuery({
    get: (name: string) => c.req.query(name) ?? null,
  });
  const result = await runMindspaceSupervisorForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    prompt: body.prompt ?? '',
    ...(Array.isArray(body.paths) ? { paths: body.paths } : {}),
  }, { mastra, mindspaceFactory, ...(version ? { version } : {}) });
  return c.json(result);
});

app.get('/api/projects/:projectId/mastra/agents', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const mindspaceFactory = c.get('mindspaceFactory');
  const result = await listMindspaceMastraAgentsForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
  }, { mastra, mindspaceFactory });
  return c.json(result);
});

app.post('/api/projects/:projectId/mastra/agents/:agentId/generate', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const mindspaceFactory = c.get('mindspaceFactory');
  const body = await c.req.json<{ messages?: string; threadId?: string }>();
  const version = parseAgentVersionFromQuery({
    get: (name: string) => c.req.query(name) ?? null,
  });
  const result = await generateMindspaceMastraAgentForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    agentId: c.req.param('agentId'),
    messages: body.messages ?? '',
    ...(body.threadId ? { threadId: body.threadId } : {}),
  }, { mastra, mindspaceFactory, ...(version ? { version } : {}) });
  return c.json(result);
});

app.post('/api/projects/:projectId/mastra/agents/:agentId/stream', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const mindspaceFactory = c.get('mindspaceFactory');
  const body = await c.req.json<{ messages?: string; threadId?: string }>();
  const version = parseAgentVersionFromQuery({
    get: (name: string) => c.req.query(name) ?? null,
  });
  const stream = streamMindspaceMastraAgentForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    agentId: c.req.param('agentId'),
    messages: body.messages ?? '',
    ...(body.threadId ? { threadId: body.threadId } : {}),
  }, { mastra, mindspaceFactory, ...(version ? { version } : {}) });
  return createSseResponse(stream);
});

app.get('/api/projects/:projectId/mastra/workflows', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const mindspaceFactory = c.get('mindspaceFactory');
  const result = await listMindspaceMastraWorkflowsForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
  }, { mastra, mindspaceFactory });
  return c.json(result);
});

app.post('/api/projects/:projectId/mastra/workflows/:workflowId/create-run', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const mindspaceFactory = c.get('mindspaceFactory');
  const result = await createMindspaceMastraWorkflowRunForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    workflowId: c.req.param('workflowId'),
  }, { mastra, mindspaceFactory });
  return c.json(result);
});

app.post('/api/projects/:projectId/mastra/workflows/:workflowId/start', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const mindspaceFactory = c.get('mindspaceFactory');
  const body = await c.req.json<{ runId?: string; inputData?: unknown; threadId?: string }>();
  const result = await startMindspaceMastraWorkflowForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    workflowId: c.req.param('workflowId'),
    ...(body.runId ? { runId: body.runId } : {}),
    ...(body.threadId ? { threadId: body.threadId } : {}),
    inputData: body.inputData,
  }, { mastra, mindspaceFactory });
  return c.json(result);
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
  const mindspaceFactory = c.get('mindspaceFactory');
  const result = await listChannelFeedForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    channelId: c.req.param('channelId'),
  }, { mastra, mindspaceFactory });
  return c.json(result);
});

app.post('/api/projects/:projectId/channels/:channelId/posts', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const mindspaceFactory = c.get('mindspaceFactory');
  const body = await c.req.json<{ message?: string }>();
  const result = await createChannelPostForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    channelId: c.req.param('channelId'),
    message: body.message ?? '',
  }, { mastra, mindspaceFactory });
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
  const mindspaceFactory = c.get('mindspaceFactory');
  const body = await c.req.json<{ title?: string }>();
  const result = await createChannelThreadForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    channelId: c.req.param('channelId'),
    title: body.title ?? null,
  }, { mastra, mindspaceFactory });
  return c.json(result);
});

app.get('/api/projects/:projectId/channels/:channelId/threads/:threadId', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const mindspaceFactory = c.get('mindspaceFactory');
  const result = await getChannelThreadForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    channelId: c.req.param('channelId'),
    threadId: c.req.param('threadId'),
  }, { mastra, mindspaceFactory });
  return c.json(result);
});

app.post('/api/projects/:projectId/channels/:channelId/threads/:threadId/messages', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const mindspaceFactory = c.get('mindspaceFactory');
  const body = await c.req.json<{ message?: string }>();
  const result = await sendChannelMessageForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    channelId: c.req.param('channelId'),
    threadId: c.req.param('threadId'),
    message: body.message ?? '',
  }, { mastra, mindspaceFactory });
  return c.json(result);
});

app.post('/api/projects/:projectId/channels/:channelId/threads/:threadId/messages/stream', async (c) => {
  const principal = c.get('principal');
  const mastra = c.get('mastra');
  const mindspaceFactory = c.get('mindspaceFactory');
  const body = await c.req.json<{ message?: string }>();
  const stream = await streamChannelReplyForPrincipal({
    firebaseUid: principal.uid,
    projectId: c.req.param('projectId'),
    channelId: c.req.param('channelId'),
    threadId: c.req.param('threadId'),
    ...(typeof body.message === 'string' ? { message: body.message } : {}),
  }, { mastra, mindspaceFactory });

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
