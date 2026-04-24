import { createMiddleware } from 'hono/factory';

import type { VerifiedFirebasePrincipal } from '@mastra-mindspace/platform';

export type AppBindings = {
  Variables: {
    principal: VerifiedFirebasePrincipal;
  };
};

export function createAuthMiddleware(params: {
  tokenVerifier: {
    verifyIdToken(token: string): Promise<VerifiedFirebasePrincipal>;
  };
}) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const authorization = c.req.header('authorization');

    if (!authorization?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = authorization.slice('Bearer '.length);
    const principal = await params.tokenVerifier.verifyIdToken(token);

    c.set('principal', principal);
    await next();
  });
}
