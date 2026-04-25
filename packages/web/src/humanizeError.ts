// ABOUTME: Maps raw transport/framework errors into short user-facing copy
// ABOUTME: Used by App error handling so scoped banners stay readable

export function humanizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('missing authorization') || lower.includes('invalid token') || lower.includes('401')) {
    return 'Your session expired. Sign in again.';
  }

  if (lower.includes('network') || lower.includes('failed to fetch')) {
    return 'Network error. Check your connection and try again.';
  }

  if (lower.includes('channel already exists')) {
    return 'A channel with that name already exists.';
  }

  if (lower.includes('stream interrupted')) {
    return 'The reply was interrupted before it finished.';
  }

  return message.replace(/^error:\s*/i, '');
}
