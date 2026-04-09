import { Hono } from 'hono';

export const meRoutes = new Hono<{
  Variables: {
    principal: {
      uid: string;
      email: string | null;
      emailVerified: boolean;
      name: string | null;
      picture: string | null;
      authTime: number | null;
      rawClaims: Record<string, unknown>;
    };
  };
}>();

meRoutes.get('/me', (c) => {
  const principal = c.get('principal');

  return c.json({
    uid: principal.uid,
    email: principal.email,
    emailVerified: principal.emailVerified,
    name: principal.name,
  });
});
