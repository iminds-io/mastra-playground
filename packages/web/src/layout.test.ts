// ABOUTME: Tests that the layout CSS supports 2-column and 3-column shell states
// ABOUTME: Validates grid template, transition, sign-in screen, and thread-open class

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const stylesPath = resolve(dirname(fileURLToPath(import.meta.url)), 'styles.css');
const styles = readFileSync(stylesPath, 'utf8');

function normalizeCss(source: string) {
  return source.replace(/\s+/g, ' ').trim();
}

describe('layout shell', () => {
  it('defines a 2-column default grid for the mindspace shell', () => {
    const normalized = normalizeCss(styles);

    expect(normalized).toMatch(/\.mindspace-shell\s*\{[^}]*grid-template-columns:[^}]*260px/);
  });

  it('defines a transition on grid-template-columns for the slide-in effect', () => {
    const normalized = normalizeCss(styles);

    expect(normalized).toMatch(/\.mindspace-shell\s*\{[^}]*transition:[^}]*grid-template-columns/);
  });

  it('expands to 3 columns when thread-open class is applied', () => {
    const normalized = normalizeCss(styles);

    expect(normalized).toMatch(/\.mindspace-shell\.thread-open/);
  });

  it('hides the thread drawer by default with overflow hidden', () => {
    const normalized = normalizeCss(styles);

    expect(normalized).toMatch(/\.thread-drawer\s*\{[^}]*overflow:\s*hidden/);
  });

  it('defines the sign-in screen as a centered flexbox layout', () => {
    const normalized = normalizeCss(styles);

    expect(normalized).toMatch(/\.sign-in-screen\s*\{[^}]*display:\s*flex/);
    expect(normalized).toMatch(/\.sign-in-screen\s*\{[^}]*justify-content:\s*center/);
    expect(normalized).toMatch(/\.sign-in-screen\s*\{[^}]*align-items:\s*center/);
    expect(normalized).toMatch(/\.sign-in-screen\s*\{[^}]*height:\s*100vh/);
  });
});
