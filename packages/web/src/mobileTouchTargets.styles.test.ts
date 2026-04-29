// ABOUTME: Tests that mobile CSS enforces WCAG 2.5.5 minimum touch target sizes
// ABOUTME: Validates 44px minimums on interactive elements within the 768px breakpoint

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

describe('mobile touch targets (WCAG 2.5.5)', () => {
  const mobileBlock = extractMobileBlock(styles);

  it('enforces 44px min-height on mobile top bar buttons', () => {
    expect(mobileBlock).toMatch(/\.mobile-topbar\s+button[^{]*\{[^}]*min-height:\s*44px/);
    expect(mobileBlock).toMatch(/\.mobile-topbar\s+button[^{]*\{[^}]*min-width:\s*44px/);
  });

  it('enforces 44px min-height on channel buttons', () => {
    expect(mobileBlock).toMatch(/\.channel-button[^{]*\{[^}]*min-height:\s*44px/);
  });

  it('enforces 72px min-height on feed card buttons', () => {
    expect(mobileBlock).toMatch(/\.feed-card-button[^{]*\{[^}]*min-height:\s*72px/);
  });

  it('enforces 48px min-height on composer wrapper', () => {
    expect(mobileBlock).toMatch(/\.composer-wrapper[^{]*\{[^}]*min-height:\s*48px/);
  });

  it('enforces 44px min-height on sidebar member rows', () => {
    expect(mobileBlock).toMatch(/\.sidebar-member-row[^{]*\{[^}]*min-height:\s*44px/);
  });
});
