// ABOUTME: Tests for the relative timestamp formatting utility
// ABOUTME: Validates all six tiers of the timestamp display format

import { describe, expect, it } from 'vitest';

import { formatTimestamp } from './formatTimestamp';

describe('formatTimestamp', () => {
  const now = new Date('2026-04-23T14:30:00.000Z');

  it('returns "Just now" for timestamps less than 1 minute ago', () => {
    const thirtySecondsAgo = new Date('2026-04-23T14:29:30.000Z');
    expect(formatTimestamp(thirtySecondsAgo.toISOString(), now)).toBe('Just now');
  });

  it('returns "Just now" for timestamps exactly now', () => {
    expect(formatTimestamp(now.toISOString(), now)).toBe('Just now');
  });

  it('returns relative minutes for timestamps 1-59 minutes ago', () => {
    const fiveMinAgo = new Date('2026-04-23T14:25:00.000Z');
    expect(formatTimestamp(fiveMinAgo.toISOString(), now)).toBe('5 min ago');
  });

  it('returns "1 min ago" for exactly 1 minute ago', () => {
    const oneMinAgo = new Date('2026-04-23T14:29:00.000Z');
    expect(formatTimestamp(oneMinAgo.toISOString(), now)).toBe('1 min ago');
  });

  it('returns "59 min ago" for 59 minutes ago', () => {
    const fiftyNineMinAgo = new Date('2026-04-23T13:31:00.000Z');
    expect(formatTimestamp(fiftyNineMinAgo.toISOString(), now)).toBe('59 min ago');
  });

  it('returns time only for timestamps earlier today', () => {
    const thisMorning = new Date('2026-04-23T09:15:00.000Z');
    const result = formatTimestamp(thisMorning.toISOString(), now);

    expect(result).toMatch(/^\d{1,2}:\d{2}\s*(AM|PM)$/i);
    expect(result.startsWith('Yesterday')).toBe(false);
  });

  it('returns "Yesterday, <time>" for timestamps from yesterday', () => {
    const yesterday = new Date('2026-04-22T14:30:00.000Z');
    expect(formatTimestamp(yesterday.toISOString(), now)).toMatch(/^Yesterday,\s+\d{1,2}:\d{2}\s*(AM|PM)$/i);
  });

  it('returns "Mon DD, <time>" for timestamps earlier this year', () => {
    const earlier = new Date('2026-03-15T10:00:00.000Z');
    expect(formatTimestamp(earlier.toISOString(), now)).toMatch(/^Mar 15,\s+\d{1,2}:\d{2}\s*(AM|PM)$/i);
  });

  it('returns "Mon DD, YYYY" for timestamps from a previous year', () => {
    const lastYear = new Date('2025-12-25T10:00:00.000Z');
    expect(formatTimestamp(lastYear.toISOString(), now)).toBe('Dec 25, 2025');
  });

  it('returns "Just now" for null or undefined input', () => {
    expect(formatTimestamp(null, now)).toBe('Just now');
    expect(formatTimestamp(undefined, now)).toBe('Just now');
  });

  it('returns "Just now" for invalid date strings', () => {
    expect(formatTimestamp('not-a-date', now)).toBe('Just now');
  });
});
