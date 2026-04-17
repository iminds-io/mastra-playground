// ABOUTME: Tests for the cn() class-name merging utility
// ABOUTME: Verifies clsx combination and tailwind-merge conflict resolution

import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('returns a single class unchanged', () => {
    expect(cn('foo')).toBe('foo');
  });

  it('joins multiple classes', () => {
    expect(cn('foo', 'bar', 'baz')).toBe('foo bar baz');
  });

  it('filters falsy values', () => {
    expect(cn('foo', false, undefined, null, 'bar')).toBe('foo bar');
  });

  it('resolves tailwind conflicts — last value wins', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-sm', 'text-lg')).toBe('text-lg');
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
  });

  it('merges conditional classes', () => {
    const active = true;
    expect(cn('base', active && 'active')).toBe('base active');
    expect(cn('base', !active && 'inactive')).toBe('base');
  });
});
