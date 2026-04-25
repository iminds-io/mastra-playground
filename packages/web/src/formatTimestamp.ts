// ABOUTME: Relative timestamp formatting with six display tiers
// ABOUTME: Handles "Just now", minutes ago, today, yesterday, this year, and older dates

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

function formatTime(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, '0');
  return `${displayHours}:${displayMinutes} ${ampm}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isYesterday(date: Date, now: Date): boolean {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(date, yesterday);
}

export function formatTimestamp(isoString: string | null | undefined, now: Date = new Date()): string {
  if (!isoString) {
    return 'Just now';
  }

  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) {
    return 'Just now';
  }

  const diffMs = now.getTime() - date.getTime();

  if (diffMs < ONE_MINUTE_MS) {
    return 'Just now';
  }

  if (diffMs < ONE_HOUR_MS) {
    const minutes = Math.floor(diffMs / ONE_MINUTE_MS);
    return `${minutes} min ago`;
  }

  if (isSameDay(date, now)) {
    return formatTime(date);
  }

  if (isYesterday(date, now)) {
    return `Yesterday, ${formatTime(date)}`;
  }

  if (date.getFullYear() === now.getFullYear()) {
    return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${formatTime(date)}`;
  }

  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}
