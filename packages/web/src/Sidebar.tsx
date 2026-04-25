// ABOUTME: Persistent navigation sidebar composed from project, channel, awareness, and user sections
// ABOUTME: Replaces the old flat list with a structured progressive-disclosure sidebar

import type { AccessibleProjectSummary, ChannelSummary } from './api';
import { ChannelList } from './ChannelList';
import { MindsList } from './MindsList';
import { ProjectSwitcher } from './ProjectSwitcher';
import type { MindSummary, TeammateSummary } from './sidebar-stubs';
import { TeammatesList } from './TeammatesList';
import type { Theme } from './UserFooter';
import { UserFooter } from './UserFooter';

export type SidebarProps = {
  projects: AccessibleProjectSummary[];
  activeProjectId: string;
  isAdmin: boolean;
  channels: ChannelSummary[];
  selectedChannelId: string;
  isCreatingChannel: boolean;
  channelError: string | undefined;
  minds: MindSummary[];
  teammates: TeammateSummary[];
  userName: string;
  userInitials: string;
  theme: Theme;
  onNavigateProject: (projectId: string) => void;
  onOpenSettings: () => void;
  onSelectChannel: (channelId: string) => void;
  onCreateChannel: (name: string) => void;
  onSignOut: () => void;
  onToggleTheme: () => void;
};

function deriveProjectInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}

export function Sidebar({
  projects,
  activeProjectId,
  isAdmin,
  channels,
  selectedChannelId,
  isCreatingChannel,
  channelError,
  minds,
  teammates,
  userName,
  userInitials,
  theme,
  onNavigateProject,
  onOpenSettings,
  onSelectChannel,
  onCreateChannel,
  onSignOut,
  onToggleTheme,
}: SidebarProps) {
  const activeProject = projects.find((project) => project.id === activeProjectId);

  return (
    <aside className="sidebar">
      <div className="sidebar-rail">
        <button className="sidebar-rail-icon" aria-label="Project">
          {activeProject ? deriveProjectInitials(activeProject.name) : '??'}
        </button>
        <hr className="sidebar-rail-divider" />
        <button className="sidebar-rail-icon" aria-label="Channels">
          #
        </button>
        <button className="sidebar-rail-icon" aria-label="Minds">
          {'\u{1F916}'}
        </button>
        <button className="sidebar-rail-icon" aria-label="Teammates">
          {'\u{1F465}'}
        </button>
        <div style={{ flex: 1 }} />
        <button className="sidebar-rail-icon" aria-label="User">
          {userInitials}
        </button>
      </div>

      <div className="sidebar-content">
        <ProjectSwitcher
          projects={projects}
          activeProjectId={activeProjectId}
          isAdmin={isAdmin}
          onSelectProject={onNavigateProject}
          onOpenSettings={onOpenSettings}
        />

        <hr className="sidebar-divider" />

        <ChannelList
          channels={channels}
          selectedChannelId={selectedChannelId}
          isCreatingChannel={isCreatingChannel}
          channelError={channelError}
          onSelectChannel={onSelectChannel}
          onCreateChannel={onCreateChannel}
        />

        <hr className="sidebar-divider" />

        <MindsList minds={minds} />

        <hr className="sidebar-divider" />

        <TeammatesList teammates={teammates} />

        <UserFooter
          displayName={userName}
          initials={userInitials}
          theme={theme}
          onSignOut={onSignOut}
          onToggleTheme={onToggleTheme}
        />
      </div>
    </aside>
  );
}
