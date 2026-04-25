// ABOUTME: Dropdown project switcher with search, grouping, and settings gear
// ABOUTME: Shows a single active project and an overlay for project switching

import { useEffect, useRef, useState } from 'react';

import { Input } from '@mastra-mindspace/ui';

import type { AccessibleProjectSummary } from './api';

export type ProjectSwitcherProps = {
  projects: AccessibleProjectSummary[];
  activeProjectId: string;
  isAdmin: boolean;
  onSelectProject: (projectId: string) => void;
  onOpenSettings: () => void;
};

export function ProjectSwitcher({
  projects,
  activeProjectId,
  isAdmin,
  onSelectProject,
  onOpenSettings,
}: ProjectSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const activeProject = projects.find((project) => project.id === activeProjectId);
  const memberCount = projects.length;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  const filteredProjects = projects.filter(
    (project) =>
      project.name.toLowerCase().includes(search.toLowerCase()) ||
      project.slug.toLowerCase().includes(search.toLowerCase()),
  );
  const activeProjects = filteredProjects.filter((project) => project.status === 'active');
  const archivedProjects = filteredProjects.filter((project) => project.status === 'archived');

  function handleSelect(projectId: string) {
    onSelectProject(projectId);
    setIsOpen(false);
    setSearch('');
  }

  return (
    <div className="project-switcher" ref={containerRef}>
      <div className="project-switcher-trigger">
        <button
          className="project-switcher-button"
          aria-label="Switch project"
          onClick={() => {
            setIsOpen((current) => !current);
            setSearch('');
          }}
        >
          <span className="project-switcher-arrow">{isOpen ? '\u25B2' : '\u25BC'}</span>
          <div className="project-switcher-info">
            <span className="project-switcher-name">{activeProject?.name ?? 'No project selected'}</span>
            <span className="project-switcher-meta">
              {activeProject?.slug ?? ''}
              {activeProject ? ` \u00B7 ${memberCount} project${memberCount === 1 ? '' : 's'}` : ''}
            </span>
          </div>
        </button>

        <button
          className="project-switcher-gear"
          aria-label="Project settings"
          onClick={onOpenSettings}
        >
          {'\u2699\uFE0F'}
        </button>
      </div>

      {isOpen ? (
        <div className="project-switcher-overlay">
          <div className="project-switcher-search">
            <Input
              placeholder="Search projects..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              autoFocus
            />
          </div>

          {activeProjects.length > 0 ? (
            <div className="project-switcher-group">
              <p className="eyebrow">ACTIVE</p>
              {activeProjects.map((project) => (
                <button
                  key={project.id}
                  className="project-switcher-item"
                  data-project-id={project.id}
                  onClick={() => handleSelect(project.id)}
                >
                  <span>{project.name}</span>
                  {project.id === activeProjectId ? <span className="project-switcher-check">{'\u2713'}</span> : null}
                </button>
              ))}
            </div>
          ) : null}

          {archivedProjects.length > 0 ? (
            <div className="project-switcher-group">
              <p className="eyebrow">ARCHIVED</p>
              {archivedProjects.map((project) => (
                <button
                  key={project.id}
                  className="project-switcher-item project-switcher-item-archived"
                  data-project-id={project.id}
                  onClick={() => handleSelect(project.id)}
                >
                  <span>{project.name}</span>
                  {project.id === activeProjectId ? <span className="project-switcher-check">{'\u2713'}</span> : null}
                </button>
              ))}
            </div>
          ) : null}

          {isAdmin ? (
            <div className="project-switcher-footer">
              <button className="project-switcher-create">+ Create project</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
