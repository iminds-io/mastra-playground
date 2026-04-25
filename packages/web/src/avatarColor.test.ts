// ABOUTME: Tests for deterministic avatar color generation from names
// ABOUTME: Validates color consistency, valid OKLCH output, and initials extraction

import { describe, expect, it } from 'vitest';

import { getAvatarColor, getInitials } from './avatarColor';

describe('getAvatarColor', () => {
  it('returns the same color for the same name', () => {
    expect(getAvatarColor('Alice Chen')).toBe(getAvatarColor('Alice Chen'));
  });

  it('returns different colors for different names', () => {
    expect(getAvatarColor('Alice Chen')).not.toBe(getAvatarColor('Bob Martinez'));
  });

  it('returns a valid OKLCH color string', () => {
    expect(getAvatarColor('Alice Chen')).toMatch(/^oklch\(\d+(\.\d+)?\s+\d+(\.\d+)?\s+\d+(\.\d+)?\)$/);
  });

  it('produces hue values in the 0-360 range', () => {
    const hue = Number(getAvatarColor('Alice Chen').match(/oklch\([\d.]+\s+[\d.]+\s+([\d.]+)\)/)?.[1] ?? -1);
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
  });
});

describe('getInitials', () => {
  it('returns first letters of first and last name', () => {
    expect(getInitials('Alice Chen')).toBe('AC');
  });

  it('returns first two letters for a single name', () => {
    expect(getInitials('Alice')).toBe('AL');
  });

  it('handles three or more names by using first and last', () => {
    expect(getInitials('Alice B Chen')).toBe('AC');
  });

  it('uppercases the result', () => {
    expect(getInitials('alice chen')).toBe('AC');
  });

  it('handles empty string gracefully', () => {
    expect(getInitials('')).toBe('??');
  });

  it('handles null/undefined by returning fallback', () => {
    expect(getInitials(null)).toBe('??');
    expect(getInitials(undefined)).toBe('??');
  });
});
