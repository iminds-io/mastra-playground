// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminConsole } from './AdminConsole';

const defaultProps = {
  user: { email: 'test02@test.com' },
  projects: [],
  projectName: 'Demo Project',
  projectId: '',
  adminMessage: 'hello',
  meResult: '',
  mindspaceResult: '',
  adminResult: '',
  errors: new Map<string, string>(),
  testEmail: 'test02@test.com',
  testPassword: 'test2@',
  isLoadingOp: () => false,
  onSetProjectName: vi.fn(),
  onSetProjectId: vi.fn(),
  onSetAdminMessage: vi.fn(),
  onSetTestEmail: vi.fn(),
  onSetTestPassword: vi.fn(),
  onSignInWithGoogle: vi.fn(),
  onSignOut: vi.fn(),
  onTestSignIn: vi.fn(),
  onGetMe: vi.fn(),
  onBootstrapProject: vi.fn(),
  onRunAdminTest: vi.fn(),
};

describe('AdminConsole', () => {
  afterEach(cleanup);

  it('shows a clear empty state when no projects exist yet', () => {
    render(<AdminConsole {...defaultProps} />);

    expect(screen.getByText(/no projects exist in this local dev database yet/i)).toBeTruthy();
  });

  it('explains that admin project listing is separate from project membership', () => {
    render(<AdminConsole {...defaultProps} />);

    expect(
      screen.getByText(/admin project listing is separate from project membership/i),
    ).toBeTruthy();
  });
});
