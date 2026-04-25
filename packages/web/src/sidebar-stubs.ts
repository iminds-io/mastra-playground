// ABOUTME: Placeholder data for sidebar sections that do not have backend endpoints yet
// ABOUTME: Replace with real API-backed data when members and minds APIs ship

export type MindSummary = {
  id: string;
  name: string;
  icon: string;
  presence: 'online' | 'offline';
};

export type TeammateSummary = {
  id: string;
  displayName: string;
  initials: string;
  email: string;
  presence: 'online' | 'offline';
};

export const STUB_MINDS: MindSummary[] = [
  { id: 'mind-librarian', name: 'Librarian', icon: '\u{1F4DA}', presence: 'online' },
  { id: 'mind-claude', name: 'Claude', icon: '\u{1F916}', presence: 'online' },
];

export const STUB_TEAMMATES: TeammateSummary[] = [
  {
    id: 'teammate-1',
    displayName: 'Alice Chen',
    initials: 'AC',
    email: 'alice@example.com',
    presence: 'online',
  },
  {
    id: 'teammate-2',
    displayName: 'Bob Martinez',
    initials: 'BM',
    email: 'bob@example.com',
    presence: 'offline',
  },
];
