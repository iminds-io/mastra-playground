// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsModal } from './SettingsModal';

const props = {
  open: true,
  general: {
    role: 'owner',
    project: {
      id: 'project-1',
      organizationId: 'org-1',
      name: 'Alpha Mindspace',
      slug: 'alpha-mindspace',
      status: 'active',
      createdAt: '2026-04-24T00:00:00.000Z',
    },
  },
  members: {
    role: 'owner',
    members: [
      {
        membershipId: 'membership-1',
        userId: 'user-1',
        role: 'owner',
        displayName: 'Avery',
        email: 'avery@example.com',
      },
    ],
    invitations: [],
  },
  minds: {
    role: 'owner',
    minds: [
      {
        id: 'mind-1',
        project_id: 'project-1',
        agent_id: 'librarian',
        display_name: 'Librarian',
        icon: '📚',
        blurb: 'Keeps context tidy.',
        enabled: true,
        prompt_override: null,
      },
    ],
  },
  isLoading: false,
  error: undefined,
  onClose: vi.fn(),
  onRefresh: vi.fn(),
  onSaveGeneral: vi.fn(),
  onArchiveProject: vi.fn(),
  onInviteMember: vi.fn(),
  onRemoveMember: vi.fn(),
  onUpdateMind: vi.fn(),
};

describe('SettingsModal', () => {
  afterEach(cleanup);

  it('renders the dialog and project title', () => {
    render(<SettingsModal {...props} />);
    expect(screen.getByRole('dialog', { name: /project settings/i })).toBeTruthy();
    expect(screen.getByDisplayValue('Alpha Mindspace')).toBeTruthy();
  });

  it('saves general settings', () => {
    const onSaveGeneral = vi.fn();
    render(<SettingsModal {...props} onSaveGeneral={onSaveGeneral} />);

    fireEvent.change(screen.getByLabelText(/project name/i), {
      target: { value: 'Renamed Mindspace' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save project settings/i }));

    expect(onSaveGeneral).toHaveBeenCalledWith('Renamed Mindspace');
  });

  it('invites a member from the members tab', () => {
    const onInviteMember = vi.fn();
    render(<SettingsModal {...props} onInviteMember={onInviteMember} />);

    fireEvent.click(screen.getByRole('button', { name: /^members$/i }));
    fireEvent.change(screen.getByLabelText(/invite by email/i), {
      target: { value: 'new@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }));

    expect(onInviteMember).toHaveBeenCalledWith('new@example.com', 'member');
  });

  it('updates a mind config from the minds tab', () => {
    const onUpdateMind = vi.fn();
    render(<SettingsModal {...props} onUpdateMind={onUpdateMind} />);

    fireEvent.click(screen.getByRole('button', { name: /^minds$/i }));
    fireEvent.change(screen.getByLabelText(/display name for librarian/i), {
      target: { value: 'Archivist' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save librarian settings/i }));

    expect(onUpdateMind).toHaveBeenCalledWith('mind-1', {
      displayName: 'Archivist',
      icon: '📚',
      blurb: 'Keeps context tidy.',
      enabled: true,
      promptOverride: null,
    });
  });

  it('closes on backdrop click', () => {
    const onClose = vi.fn();
    render(<SettingsModal {...props} onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog', { name: /project settings/i }).parentElement!);
    expect(onClose).toHaveBeenCalled();
  });
});
