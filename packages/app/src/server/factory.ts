import { Hono } from 'hono';
import { MastraServer } from '@mastra/hono';

import { createFirebaseTokenVerifier, createMastra, executeProjectAgent } from '@hono-workspace/platform';

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
  binding: unknown;
  message: string;
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
  app.post('/api/projects/:projectId/agent/run', async (c) => {
    const principal = c.get('principal');
    const body = await c.req.json<{ message?: string }>();
    const result = await (params.executeProjectAgent ?? executeProjectAgent)({
      firebaseUid: principal.uid,
      projectId: c.req.param('projectId'),
      message: body.message ?? '',
    });

    return c.json({
      resourceId: result.resourceId,
      workspaceRootPath: result.workspaceRootPath,
      message: result.message,
    });
  });

  const server = new MastraServer({ app, mastra });
  await server.init();

  return app;
}
