import { describe, expect, it } from 'vitest';

import { canAccessAdminConsole, normalizeAdminAllowlist } from '../../src/services/admin-access';

describe('admin access helpers', () => {
  it('normalizes string and array allowlists into lowercase email entries', () => {
    expect(normalizeAdminAllowlist(' Admin@Example.com, ,SECOND@example.com ')).toEqual([
      'admin@example.com',
      'second@example.com',
    ]);
    expect(normalizeAdminAllowlist([' USER@example.com ', '', 'Two@example.com'])).toEqual([
      'user@example.com',
      'two@example.com',
    ]);
  });

  it('returns true only when the principal email is allowlisted', () => {
    expect(
      canAccessAdminConsole({
        email: 'Admin@Example.com',
        adminEmails: ['user@example.com', 'admin@example.com'],
      }),
    ).toBe(true);

    expect(
      canAccessAdminConsole({
        email: 'missing@example.com',
        adminEmails: 'user@example.com,admin@example.com',
      }),
    ).toBe(false);

    expect(
      canAccessAdminConsole({
        email: null,
        adminEmails: 'user@example.com,admin@example.com',
      }),
    ).toBe(false);
  });
});
