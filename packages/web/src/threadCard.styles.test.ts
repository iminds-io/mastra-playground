// ABOUTME: Tests that thread card CSS defines the expected layout rules
// ABOUTME: Validates header row, text truncation, channel header, and composer wrapper styles

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const stylesPath = resolve(dirname(fileURLToPath(import.meta.url)), 'styles.css');
const styles = readFileSync(stylesPath, 'utf8');

function normalizeCss(source: string) {
  return source.replace(/\s+/g, ' ').trim();
}

describe('thread card styles', () => {
  it('defines a header row with space-between alignment', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(/\.feed-card-header\s*\{[^}]*display:\s*flex/);
    expect(normalized).toMatch(/\.feed-card-header\s*\{[^}]*justify-content:\s*space-between/);
  });

  it('truncates feed-card-text to 2 lines with line-clamp', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(/\.feed-card-text\s*\{[^}]*-webkit-line-clamp:\s*2/);
  });

  it('defines styles for the author name', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(/\.feed-card-author\s*\{[^}]*font-weight:\s*600/);
  });

  it('defines styles for the timestamp', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(/\.feed-card-timestamp\s*\{[^}]*color:\s*var\(--muted-foreground\)/);
  });

  it('defines channel header row as a flex container with space-between', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(/\.channel-feed-header-row\s*\{[^}]*display:\s*flex/);
    expect(normalized).toMatch(/\.channel-feed-header-row\s*\{[^}]*justify-content:\s*space-between/);
  });

  it('defines channel header actions as a flex row', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(/\.channel-feed-header-actions\s*\{[^}]*display:\s*flex/);
  });

  it('defines the composer wrapper as a positioned container', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(/\.composer-wrapper\s*\{[^}]*position:\s*relative/);
  });

  it('positions the composer hint absolutely within the wrapper', () => {
    const normalized = normalizeCss(styles);
    expect(normalized).toMatch(/\.composer-hint\s*\{[^}]*position:\s*absolute/);
  });
});
