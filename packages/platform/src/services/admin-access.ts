export function normalizeAdminAllowlist(raw: string[] | string | undefined): string[] {
  return (Array.isArray(raw) ? raw : (raw ?? '').split(','))
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export function canAccessAdminConsole(input: {
  email: string | null;
  adminEmails: string[] | string | undefined;
}): boolean {
  if (!input.email) {
    return false;
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  if (!normalizedEmail) {
    return false;
  }

  return normalizeAdminAllowlist(input.adminEmails).includes(normalizedEmail);
}
