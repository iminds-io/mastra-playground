// ABOUTME: Sidebar footer showing current user identity, sign-out, and theme toggle
// ABOUTME: Pinned to the bottom of the sidebar for persistent personal controls

import { Avatar } from './Avatar';

export type Theme = 'light' | 'dark' | 'system';

const THEME_ICONS: Record<Theme, string> = {
  light: '\u2600\uFE0F',
  dark: '\u{1F319}',
  system: '\u{1F4BB}',
};

export type UserFooterProps = {
  displayName: string;
  initials: string;
  theme: Theme;
  onSignOut: () => void;
  onToggleTheme: () => void;
};

export function UserFooter({ displayName, initials, theme, onSignOut, onToggleTheme }: UserFooterProps) {
  return (
    <footer className="user-footer">
      <div className="user-footer-identity">
        <Avatar variant="initials" text={initials} size="sm" />
        <span className="user-footer-name">{displayName}</span>
      </div>
      <div className="user-footer-actions">
        <button className="user-footer-theme" aria-label="Toggle theme" onClick={onToggleTheme}>
          {THEME_ICONS[theme]}
        </button>
        <span className="user-footer-separator">{'\u00B7'}</span>
        <button className="user-footer-signout" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </footer>
  );
}
