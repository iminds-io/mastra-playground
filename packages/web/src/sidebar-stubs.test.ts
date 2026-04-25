// ABOUTME: Tests that sidebar stub data conforms to expected types
// ABOUTME: Guards against accidental shape changes in placeholder data

import { describe, expect, it } from 'vitest';

import { STUB_MINDS, STUB_TEAMMATES, type MindSummary, type TeammateSummary } from './sidebar-stubs';

describe('sidebar stubs', () => {
  it('provides mind summaries with required fields', () => {
    expect(STUB_MINDS.length).toBeGreaterThan(0);

    for (const mind of STUB_MINDS) {
      const typed: MindSummary = mind;

      expect(typed.id).toBeTruthy();
      expect(typed.name).toBeTruthy();
      expect(typed.icon).toBeTruthy();
      expect(['online', 'offline']).toContain(typed.presence);
    }
  });

  it('provides teammate summaries with required fields', () => {
    expect(STUB_TEAMMATES.length).toBeGreaterThan(0);

    for (const teammate of STUB_TEAMMATES) {
      const typed: TeammateSummary = teammate;

      expect(typed.id).toBeTruthy();
      expect(typed.displayName).toBeTruthy();
      expect(typed.initials).toBeTruthy();
      expect(typed.initials).toHaveLength(2);
      expect(['online', 'offline']).toContain(typed.presence);
    }
  });
});
