// ABOUTME: Sidebar section listing AI persona minds
// ABOUTME: Shows emoji avatars with accent rings and presence indicators

import { Avatar } from './Avatar';
import type { MindSummary } from './sidebar-stubs';

export type MindsListProps = {
  minds: MindSummary[];
};

export function MindsList({ minds }: MindsListProps) {
  return (
    <section className="sidebar-section">
      <p className="eyebrow">MINDS</p>

      {minds.length === 0 ? (
        <p className="sidebar-empty">No minds configured</p>
      ) : (
        <div className="sidebar-member-list">
          {minds.map((mind) => (
            <div key={mind.id} className="sidebar-member-row">
              <Avatar variant="icon" text={mind.icon} size="sm" />
              <span className="sidebar-member-name mind-name">{mind.name}</span>
              <span
                className={`presence-dot ${mind.presence === 'online' ? 'presence-online' : 'presence-offline'}`}
                aria-label={mind.presence}
              />
            </div>
          ))}
        </div>
      )}

      <p className="sidebar-empty" style={{ marginTop: '0.75rem' }}>
        New mind creation coming soon.
      </p>
    </section>
  );
}
