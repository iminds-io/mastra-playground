// ABOUTME: Tests for extracting agent IDs from @mention syntax in messages
// ABOUTME: Validates case-insensitive matching against a known minds list

import { describe, expect, it } from 'vitest';

import { extractMentionedAgentId } from './extractMentionedAgentId';

const minds = [
  { name: 'Librarian', emoji: '📚' },
  { name: 'Researcher', emoji: '🔬' },
];

describe('extractMentionedAgentId', () => {
  it('extracts a matching mind name from the start of a message', () => {
    expect(extractMentionedAgentId('@Librarian hello', minds)).toBe('librarian');
  });

  it('matches case-insensitively', () => {
    expect(extractMentionedAgentId('@librarian hello', minds)).toBe('librarian');
    expect(extractMentionedAgentId('@LIBRARIAN hello', minds)).toBe('librarian');
  });

  it('returns undefined when the mention does not match any known mind', () => {
    expect(extractMentionedAgentId('@UnknownBot hello', minds)).toBeUndefined();
  });

  it('returns undefined when there is no mention', () => {
    expect(extractMentionedAgentId('hello world', minds)).toBeUndefined();
  });

  it('returns undefined for empty or whitespace-only input', () => {
    expect(extractMentionedAgentId('', minds)).toBeUndefined();
    expect(extractMentionedAgentId('   ', minds)).toBeUndefined();
  });

  it('extracts a mention that appears mid-message', () => {
    expect(extractMentionedAgentId('Hey @Researcher can you help?', minds)).toBe('researcher');
  });

  it('extracts the first matching mention when multiple exist', () => {
    expect(extractMentionedAgentId('@Librarian ask @Researcher too', minds)).toBe('librarian');
  });

  it('returns undefined for an empty minds list', () => {
    expect(extractMentionedAgentId('@Librarian hello', [])).toBeUndefined();
  });
});
