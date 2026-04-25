// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { humanizeError } from './humanizeError';

describe('humanizeError', () => {
  it('maps auth failures to a session message', () => {
    expect(humanizeError(new Error('[401] {"error":"Invalid token"}'))).toContain('session expired');
  });

  it('maps network failures to a connection message', () => {
    expect(humanizeError(new Error('Network failure'))).toContain('Network error');
  });

  it('passes through unknown errors cleanly', () => {
    expect(humanizeError(new Error('Something odd happened'))).toBe('Something odd happened');
  });
});
