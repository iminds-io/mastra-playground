// ABOUTME: Sidebar section listing human project members for awareness
// ABOUTME: Shows initials avatars, names, and presence indicators

import { Avatar } from './Avatar';
import type { TeammateSummary } from './sidebar-stubs';

export type TeammatesListProps = {
  teammates: TeammateSummary[];
};

export function TeammatesList({ teammates }: TeammatesListProps) {
  return (
    <section className="sidebar-section">
      <p className="eyebrow">TEAMMATES</p>

      {teammates.length === 0 ? (
        <p className="sidebar-empty">No teammates</p>
      ) : (
        <div className="sidebar-member-list">
          {teammates.map((teammate) => (
            <div key={teammate.id} className="sidebar-member-row">
              <Avatar variant="initials" text={teammate.initials} size="sm" />
              <span className="sidebar-member-name">{teammate.displayName}</span>
              <span
                className={`presence-dot ${teammate.presence === 'online' ? 'presence-online' : 'presence-offline'}`}
                aria-label={teammate.presence}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
