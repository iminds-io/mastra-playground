// ABOUTME: Tests that the design system CSS contains light mode token definitions
// ABOUTME: Validates the data-theme="light" selector exists with required tokens

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const uiStylesPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../ui/src/styles.css');
const uiStyles = readFileSync(uiStylesPath, 'utf8');

const webStylesPath = resolve(dirname(fileURLToPath(import.meta.url)), 'styles.css');
const webStyles = readFileSync(webStylesPath, 'utf8');

function normalizeCss(source: string) {
  return source.replace(/\s+/g, ' ').trim();
}

describe('light mode tokens', () => {
  it('defines a :root[data-theme="light"] block with background and foreground tokens', () => {
    const normalized = normalizeCss(uiStyles);

    expect(normalized).toContain(':root[data-theme="light"]');
    expect(normalized).toMatch(/data-theme="light"\]\s*\{[^}]*--background:/);
    expect(normalized).toMatch(/data-theme="light"\]\s*\{[^}]*--foreground:/);
    expect(normalized).toMatch(/data-theme="light"\]\s*\{[^}]*--primary:/);
  });

  it('adjusts the body gradient for light mode', () => {
    const normalized = normalizeCss(webStyles);

    expect(normalized).toMatch(/\[data-theme="light"\][^{]*body/);
  });
});
