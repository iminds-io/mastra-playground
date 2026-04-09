import { Hono } from 'hono';

export const projectsRoutes = new Hono();

projectsRoutes.get('/:projectId/workspace', (c) =>
  c.json({
    projectId: c.req.param('projectId'),
  }),
);
