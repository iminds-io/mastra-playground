// ABOUTME: Extracts an agent ID from @mention syntax in a message
// ABOUTME: Matches case-insensitively against a list of known minds

export function extractMentionedAgentId(
  message: string,
  minds: ReadonlyArray<{ name: string }>,
): string | undefined {
  const mentionMatch = message.match(/@(\w+)/);
  if (!mentionMatch) return undefined;

  const mentioned = mentionMatch[1]!.toLowerCase();
  const matched = minds.find((m) => m.name.toLowerCase() === mentioned);
  return matched ? matched.name.toLowerCase() : undefined;
}
