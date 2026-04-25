// ABOUTME: Deterministic avatar color and initials helpers derived from display names
// ABOUTME: Keeps human avatars visually consistent across sessions without backend color data

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value.charCodeAt(index);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}

export function getAvatarColor(name: string): string {
  const hue = hashString(name) % 360;
  return `oklch(0.65 0.15 ${hue})`;
}

export function getInitials(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') {
    return '??';
  }

  const trimmed = name.trim();

  if (!trimmed) {
    return '??';
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return trimmed.slice(0, 2).toUpperCase();
  }

  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}
