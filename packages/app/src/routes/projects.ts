import { Hono } from 'hono';

export const projectsRoutes = new Hono();

projectsRoutes.get('/:projectId/mindspace', (c) =>
  c.json({
    projectId: c.req.param('projectId'),
  }),
);
