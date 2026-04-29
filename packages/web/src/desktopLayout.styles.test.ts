// ABOUTME: Tests that desktop shell wrappers use display:contents so inner components participate in the grid
// ABOUTME: Validates that mobile media query restores real display for wrapper elements

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const stylesPath = resolve(dirname(fileURLToPath(import.meta.url)), 'styles.css');
const styles = readFileSync(stylesPath, 'utf8');

function extractMobileBlock(css: string): string {
  const mobileMatch = css.match(
    /@media\s*\(max-width:\s*768px\)\s*\{([\s\S]*)\}\s*$/,
  );
  return mobileMatch ? mobileMatch[1]! : '';
}

function extractDesktopBlock(css: string): string {
  const mobileStart = css.search(/@media\s*\(max-width:\s*768px\)/);
  return mobileStart === -1 ? css : css.slice(0, mobileStart);
}

describe('desktop shell wrapper layout', () => {
  const desktop = extractDesktopBlock(styles);
  const mobile = extractMobileBlock(styles);

  it('sets display:contents on shell wrappers so inner components are direct grid participants', () => {
    expect(desktop).toMatch(
      /\.mobile-sidebar-shell[\s,][^{]*\.mobile-feed-shell[\s,][^{]*\.mobile-thread-shell[^{]*\{[^}]*display:\s*contents/,
    );
  });

  it('restores real display on mobile-sidebar-shell for mobile fixed positioning', () => {
    expect(mobile).toMatch(
      /\.mobile-sidebar-shell[^{]*\{[^}]*display:\s*block/,
    );
  });

  it('restores real display on mobile-feed-shell and mobile-thread-shell for mobile layout', () => {
    expect(mobile).toMatch(
      /\.mobile-feed-shell[\s,][^{]*\.mobile-thread-shell[^{]*\{[^}]*display:\s*block/,
    );
  });
});
