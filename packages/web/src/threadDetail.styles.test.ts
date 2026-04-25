// ABOUTME: Tests that thread detail CSS defines the expected component layout rules
// ABOUTME: Validates header, message cards, streaming treatment, reply composer, and markdown body styles

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const stylesPath = resolve(dirname(fileURLToPath(import.meta.url)), 'styles.css');
const styles = readFileSync(stylesPath, 'utf8');

function normalizeCss(source: string) {
  return source.replace(/\s+/g, ' ').trim();
}

describe('thread detail styles', () => {
  it('defines the thread header row', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(/\.thread-header-row\s*\{[^}]*display:\s*flex/);
  });

  it('defines the message-card layout', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(/\.message-card\s*\{/);
    expect(normalized).toMatch(/\.message-header\s*\{[^}]*display:\s*flex/);
  });

  it('defines dashed styling for the streaming card', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(/\.message-card-streaming\s*\{/);
    expect(normalized).toMatch(/message-card-streaming[^}]*border-style:\s*dashed/);
  });

  it('defines the blinking streaming cursor', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(/\.streaming-cursor/);
  });

  it('defines the reply composer layout', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(/\.reply-composer\s*\{/);
    expect(normalized).toMatch(/\.reply-composer-input\s*\{/);
    expect(normalized).toMatch(/\.reply-composer-chips\s*\{/);
  });

  it('defines markdown body styles', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(/\.markdown-body\s*\{/);
    expect(normalized).toMatch(/\.markdown-body blockquote\s*\{/);
  });
});
