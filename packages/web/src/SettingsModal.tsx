import { useEffect, useState } from 'react';

import { Button, Card, Input, Textarea, cn } from '@mastra-mindspace/ui';

import type { ProjectMindConfig, ProjectSettingsGeneral, ProjectSettingsMembers, ProjectSettingsMinds } from './api';

type SettingsTab = 'general' | 'members' | 'minds';

type SettingsModalProps = {
  open: boolean;
  general: ProjectSettingsGeneral | null;
  members: ProjectSettingsMembers | null;
  minds: ProjectSettingsMinds | null;
  isLoading: boolean;
  error?: string | undefined;
  onClose: () => void;
  onRefresh: () => void;
  onSaveGeneral: (name: string) => void;
  onArchiveProject: () => void;
  onInviteMember: (email: string, role: string) => void;
  onRemoveMember: (membershipId: string) => void;
  onUpdateMind: (
    mindId: string,
    input: {
      displayName?: string;
      icon?: string;
      blurb?: string | null;
      enabled?: boolean;
      promptOverride?: string | null;
    },
  ) => void;
};

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString();
}

export function SettingsModal({
  open,
  general,
  members,
  minds,
  isLoading,
  error,
  onClose,
  onRefresh,
  onSaveGeneral,
  onArchiveProject,
  onInviteMember,
  onRemoveMember,
  onUpdateMind,
}: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('general');
  const [projectNameDraft, setProjectNameDraft] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [mindDrafts, setMindDrafts] = useState<Record<string, ProjectMindConfig>>({});

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setTab('general');
    }
  }, [open]);

  useEffect(() => {
    setProjectNameDraft(general?.project.name ?? '');
  }, [general?.project.name]);

  useEffect(() => {
    setMindDrafts(
      Object.fromEntries((minds?.minds ?? []).map((mind) => [mind.id, { ...mind }])),
    );
  }, [minds]);

  if (!open) {
    return null;
  }

  return (
    <div className="settings-modal-backdrop" onClick={onClose}>
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Project settings"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-modal-header">
          <div>
            <p className="eyebrow">Settings</p>
            <h2 className="settings-modal-title">{general?.project.name ?? 'Project settings'}</h2>
          </div>
          <div className="control-row">
            <Button variant="ghost" size="sm" onClick={onRefresh}>
              Refresh
            </Button>
            <Button variant="ghost" size="icon" aria-label="Close settings" onClick={onClose}>
              &times;
            </Button>
          </div>
        </div>

        <div className="settings-modal-tabs">
          {(['general', 'members', 'minds'] as const).map((entry) => (
            <button
              key={entry}
              type="button"
              className={cn('settings-tab', tab === entry && 'settings-tab-active')}
              onClick={() => setTab(entry)}
            >
              {entry.charAt(0).toUpperCase() + entry.slice(1)}
            </button>
          ))}
        </div>

        {error ? <div className="inline-error"><span>{error}</span></div> : null}
        {isLoading ? <p className="empty-state">Loading settings…</p> : null}

        {!isLoading && tab === 'general' && general ? (
          <div className="settings-panel-grid">
            <Card className="settings-card">
              <label className="field">
                Project name
                <Input
                  aria-label="Project name"
                  value={projectNameDraft}
                  onChange={(event) => setProjectNameDraft(event.target.value)}
                />
              </label>
              <label className="field">
                Slug
                <Input value={general.project.slug} readOnly />
              </label>
              <label className="field">
                Status
                <Input value={general.project.status} readOnly />
              </label>
              <label className="field">
                Created
                <Input value={formatDate(general.project.createdAt)} readOnly />
              </label>
              <div className="control-row">
                <Button onClick={() => onSaveGeneral(projectNameDraft)} aria-label="Save project settings">
                  Save
                </Button>
                <Button variant="ghost" onClick={onArchiveProject} aria-label="Archive project">
                  Archive
                </Button>
              </div>
            </Card>
          </div>
        ) : null}

        {!isLoading && tab === 'members' && members ? (
          <div className="settings-list">
            <Card className="settings-card">
              <label className="field">
                Invite by email
                <Input
                  aria-label="Invite by email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="person@example.com"
                />
              </label>
              <label className="field">
                Role
                <select
                  aria-label="Invite role"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value)}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
              </label>
              <Button
                onClick={() => {
                  onInviteMember(inviteEmail, inviteRole);
                  setInviteEmail('');
                  setInviteRole('member');
                }}
                aria-label="Send invite"
              >
                Send invite
              </Button>
            </Card>

            {members.members.map((member) => (
              <Card key={member.membershipId} className="settings-list-card">
                <strong>{member.displayName}</strong>
                <span className="project-switcher-meta">{member.role}</span>
                <span className="project-switcher-meta">{member.email ?? 'No email'}</span>
                <Button variant="ghost" size="sm" onClick={() => onRemoveMember(member.membershipId)}>
                  Remove
                </Button>
              </Card>
            ))}

            {members.invitations.length > 0 ? (
              <Card className="settings-card">
                <p className="eyebrow">Pending invitations</p>
                {members.invitations.map((invitation) => (
                  <div key={invitation.id} className="project-switcher-meta">
                    {invitation.email} · {invitation.role} · {invitation.status}
                  </div>
                ))}
              </Card>
            ) : null}
          </div>
        ) : null}

        {!isLoading && tab === 'minds' && minds ? (
          <div className="settings-list">
            {minds.minds.map((mind) => {
              const draft = mindDrafts[mind.id] ?? mind;
              return (
                <Card key={mind.id} className="settings-card">
                  <label className="field">
                    Display name
                    <Input
                      aria-label={`Display name for ${mind.display_name}`}
                      value={draft.display_name}
                      onChange={(event) =>
                        setMindDrafts((current) => ({
                          ...current,
                          [mind.id]: { ...draft, display_name: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    Icon
                    <Input
                      value={draft.icon}
                      onChange={(event) =>
                        setMindDrafts((current) => ({
                          ...current,
                          [mind.id]: { ...draft, icon: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    Blurb
                    <Textarea
                      value={draft.blurb ?? ''}
                      onChange={(event) =>
                        setMindDrafts((current) => ({
                          ...current,
                          [mind.id]: { ...draft, blurb: event.target.value },
                        }))
                      }
                      rows={3}
                    />
                  </label>
                  <label className="field">
                    Prompt override
                    <Textarea
                      value={draft.prompt_override ?? ''}
                      onChange={(event) =>
                        setMindDrafts((current) => ({
                          ...current,
                          [mind.id]: { ...draft, prompt_override: event.target.value },
                        }))
                      }
                      rows={4}
                    />
                  </label>
                  <label className="field">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={(event) =>
                        setMindDrafts((current) => ({
                          ...current,
                          [mind.id]: { ...draft, enabled: event.target.checked },
                        }))
                      }
                    />
                    Enabled
                  </label>
                  <Button
                    onClick={() =>
                      onUpdateMind(mind.id, {
                        displayName: draft.display_name,
                        icon: draft.icon,
                        blurb: draft.blurb,
                        enabled: draft.enabled,
                        promptOverride: draft.prompt_override,
                      })
                    }
                    aria-label={`Save ${mind.display_name} settings`}
                  >
                    Save
                  </Button>
                </Card>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
