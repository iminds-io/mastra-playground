import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const stylesPath = resolve(dirname(fileURLToPath(import.meta.url)), 'styles.css');
const styles = readFileSync(stylesPath, 'utf8');

function normalizeCss(source: string) {
  return source.replace(/\s+/g, ' ').trim();
}

describe('styles.css', () => {
  it('pins html, body, and root to the viewport for shell containment', () => {
    const normalized = normalizeCss(styles);

    expect(normalized).toMatch(/html,\s*body,\s*#root\s*\{[^}]*height:\s*100%/);
    expect(normalized).toMatch(/body\s*\{[^}]*margin:\s*0/);
    expect(normalized).toMatch(/body\s*\{[^}]*overflow:\s*hidden/);
  });

  it('keeps the stacked mobile shell viewport-bound and internally scrollable', () => {
    const normalized = normalizeCss(styles);

    expect(normalized).toMatch(
      /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\.mindspace-shell\s*\{[^}]*grid-template-columns:\s*1fr;[^}]*grid-template-rows:\s*auto auto 1fr;[^}]*height:\s*100%[^}]*overflow:\s*hidden/,
    );
  });
});
