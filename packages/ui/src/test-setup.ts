// ABOUTME: Vitest test setup for @hono-workspace/ui component tests
// ABOUTME: Registers afterEach cleanup to prevent DOM bleed between test cases

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
