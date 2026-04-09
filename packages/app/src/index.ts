import { config } from 'dotenv';
import { serve } from '@hono/node-server';

import { createApp } from './server/factory';

config();

const app = await createApp();

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server running on http://localhost:${info.port}`);
  },
);
