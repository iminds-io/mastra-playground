// ABOUTME: Tests that CSS defines compressed thread card styles for State B
// ABOUTME: Validates one-line truncation and compact layout when thread detail is open

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const stylesPath = resolve(dirname(fileURLToPath(import.meta.url)), 'styles.css');
const styles = readFileSync(stylesPath, 'utf8');

function normalizeCss(source: string) {
  return source.replace(/\s+/g, ' ').trim();
}

describe('compressed index mode styles', () => {
  it('truncates feed-card-text to 1 line when thread is open', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(/\.thread-open\s+\.feed-card-text\s*\{[^}]*-webkit-line-clamp:\s*1/);
  });

  it('reduces feed-card-button padding when thread is open', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(/\.thread-open\s+\.feed-card-button\s*\{[^}]*padding/);
  });

  it('hides the composer hint in compressed mode', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(/\.thread-open\s+\.composer-hint\s*\{[^}]*display:\s*none/);
  });
});
