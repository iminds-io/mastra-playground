import { describe, expect, it } from 'vitest';

import { createLibrarianAgent } from '../../src/mastra/agents/librarian';

describe('createLibrarianAgent', () => {
  it('creates an agent with id "librarian"', () => {
    expect(createLibrarianAgent().id).toBe('librarian');
  });

  it('creates an agent named "Librarian"', () => {
    expect(createLibrarianAgent().name).toBe('Librarian');
  });

  it('has a description mentioning channel guidance', () => {
    expect(createLibrarianAgent().getDescription().toLowerCase()).toContain('channel');
  });
});
