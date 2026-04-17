# ABOUTME: Implementation plan for the shared iminds design system (packages/ui)
# ABOUTME: Covers token architecture, component library, and web package migration

# Task 06: iminds Design System — `packages/ui`

**Status**: Planning
**Created**: 2026-04-17
**Updated**: 2026-04-17
**Assigned**: Claude + Remy
**Priority**: High
**Estimated Effort**: 2–3 days
**Dependencies**: None (greenfield package)
**References**: [analyses/06_design_system_audit.md (pending), packages/web/src/styles.css, packages/web/src/App.tsx, packages/web/index.html]

---

## Objective

Create a shared `packages/ui` design system package for the `hono-workspace` monorepo that formalises the aesthetic DNA already present across three codebases (`simulation-web`, `mindblown-live-web`, `hono-workspace/web`) into a single authoritative source of truth. The package provides:

1. **CSS token layer** — OKLCH semantic colour tokens, typography tokens, spacing/radius scales, dark-first theme
2. **Tailwind v4 integration** — config-free, CSS-first, `@theme inline` mapping tokens to utilities
3. **Base component set** — Button, Card, Badge, Input, Textarea, ScrollArea, built with Radix UI + `cva` + `cn()`
4. **Consumed by `packages/web`** — `packages/web/src/styles.css` imports the ui package styles; App.tsx uses the component primitives

Source references for design decisions:
- **Token architecture, component variant API, `cn()` pattern**: `simulation-web` (Tailwind v4 + shadcn new-york)
- **Rounded radius aesthetic, micro-interactions, two-font system**: `mindblown-live-web`
- **Dark-first palette, gradient background, warm amber accent, Manrope + Inter Tight**: current `packages/web`

---

## Target State Architecture

```
packages/
├── ui/                                   ← NEW shared design system
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── styles.css                    ← @import tailwindcss + @theme + :root tokens + base layer
│   │   ├── index.ts                      ← re-exports all components + cn utility
│   │   ├── lib/
│   │   │   └── utils.ts                  ← cn() = clsx + tailwind-merge
│   │   └── components/
│   │       └── ui/
│   │           ├── button.tsx
│   │           ├── card.tsx
│   │           ├── badge.tsx
│   │           ├── input.tsx
│   │           ├── textarea.tsx
│   │           └── scroll-area.tsx
│   └── node_modules/ (after install)
│
└── web/                                  ← MIGRATED to consume packages/ui
    ├── package.json                      ← adds @hono-workspace/ui, @tailwindcss/vite
    ├── vite.config.ts                    ← adds tailwindcss() plugin
    ├── index.html                        ← unchanged (fonts already loaded)
    └── src/
        ├── styles.css                    ← slim: imports ui styles + app-only layout rules
        └── App.tsx                       ← uses Button, Card, Badge, ScrollArea from @hono-workspace/ui
```

---

## Success Criteria

- [ ] `packages/ui` builds cleanly with `tsc --noEmit` (no type errors)
- [ ] `packages/web` dev server starts without errors after migration (`pnpm --filter web dev`)
- [ ] All 6 existing `packages/web` tests pass unchanged after migration
- [ ] Every token references OKLCH values via CSS custom properties — no hardcoded hex/rgba in component styles
- [ ] Button variants (primary, ghost, outline) render correctly in dark theme
- [ ] Feed cards use `<Card>`, thread messages use `<Card>`, reply counts use `<Badge>`
- [ ] Font rendering: Manrope on all headings (`h1`–`h6`, `.eyebrow`, workspace button names), Inter Tight on all body text
- [ ] Vite HMR continues to work during development

---

## Approach

Tailwind v4 (CSS-first, no config file) with Radix UI primitives and `cva` for component variants, modelled on `simulation-web`'s architecture but with a dark-first OKLCH palette derived from the existing `packages/web` design. No CSS-in-JS. No Sass.

Key decisions derived from the three-codebase audit:
- **OKLCH throughout** (not hex, not HSL) — future-proof, perceptually uniform, matches simulation-web
- **Dark-first** (not light+dark) — hono-workspace is explicitly dark, no light mode requirement stated
- **Rounded corners** — `--radius-sm: 0.5rem`, `--radius-md: 0.95rem`, `--radius-lg: 1.5rem` — matches mindblown-live-web's rounded aesthetic and current web package
- **`--radius: 0px` NOT used** — simulation-web's sharp-corner aesthetic is explicitly rejected
- **Two fonts via CSS tokens** — `--font-heading: Manrope`, `--font-sans: Inter Tight`, mapped to Tailwind `font-heading` / `font-sans` utilities
- **Class-based dark mode** disabled — we are dark-only; `color-scheme: dark` on `:root` is sufficient
- **No Storybook** — out of scope for this iteration

---

## Implementation Plan

### Phase 1 — Scaffold `packages/ui`

#### 1.1 Create the package

```
packages/ui/
  package.json
  tsconfig.json
  src/
    styles.css
    index.ts
    lib/utils.ts
    components/ui/  (empty dirs, filled in Phase 2)
```

**`packages/ui/package.json`:**
```json
{
  "name": "@hono-workspace/ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./styles.css": "./src/styles.css"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@radix-ui/react-scroll-area": "^1.2.3",
    "@radix-ui/react-slot": "^1.2.1",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.3.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.8.3"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

**`packages/ui/tsconfig.json`:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@hono-workspace/ui": ["./src/index.ts"]
    }
  },
  "include": ["src"]
}
```

- [ ] Create `packages/ui/` directory
- [ ] Write `package.json` as above
- [ ] Write `tsconfig.json` as above
- [ ] Run `pnpm install` from monorepo root to link the new workspace package

---

#### 1.2 Write `packages/ui/src/styles.css` — the token layer

This is the most critical file. All downstream apps import it and get the full token set plus Tailwind.

```css
/* ABOUTME: Design system token layer and Tailwind v4 configuration */
/* ABOUTME: All semantic colour, typography, spacing, and radius tokens */

@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Inter+Tight:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');
@import "tailwindcss";

/* ─── Tailwind v4 theme bridge ─────────────────────────────────────────── */
/* Maps CSS custom properties to Tailwind utility classes.                  */
/* Values reference the :root token block below so all tokens are           */
/* defined in one place and utilities derive from them automatically.       */
@theme inline {
  /* Typography */
  --font-heading: var(--font-heading);
  --font-sans:    var(--font-sans);
  --font-mono:    var(--font-mono);

  /* Semantic colours */
  --color-background:         var(--background);
  --color-foreground:         var(--foreground);
  --color-card:               var(--card);
  --color-card-foreground:    var(--card-foreground);
  --color-primary:            var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary:          var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted:              var(--muted);
  --color-muted-foreground:   var(--muted-foreground);
  --color-accent:             var(--accent);
  --color-accent-foreground:  var(--accent-foreground);
  --color-destructive:        var(--destructive);
  --color-border:             var(--border);
  --color-input:              var(--input);
  --color-ring:               var(--ring);

  /* Sidebar surface tokens */
  --color-sidebar:            var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-border:     var(--sidebar-border);

  /* Radius scale */
  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius-md);
  --radius-lg: var(--radius-lg);
}

/* ─── Semantic token definitions (dark-first) ───────────────────────────── */
:root {
  color-scheme: dark;

  /* Fonts */
  --font-heading: "Manrope", "Helvetica Neue", sans-serif;
  --font-sans:    "Inter Tight", "Helvetica Neue", sans-serif;
  --font-mono:    "Consolas", "Monaco", "Courier New", monospace;

  /* --- Colour palette (OKLCH) ---                                          */
  /* Background family — deep blue-grey, matches #17181d                    */
  --background:           oklch(0.13 0.008 248);
  --foreground:           oklch(0.95 0.008 60);   /* warm off-white #f4f1ea */

  /* Card / popover surfaces — slightly lighter than bg */
  --card:                 oklch(0.17 0.008 248);
  --card-foreground:      oklch(0.95 0.008 60);

  /* Primary — amber orange, matches #f4a261 */
  --primary:              oklch(0.75 0.14 55);
  --primary-foreground:   oklch(0.13 0.008 248);

  /* Secondary — muted surface for secondary actions */
  --secondary:            oklch(0.22 0.006 248);
  --secondary-foreground: oklch(0.85 0.006 60);

  /* Muted — subtle backgrounds, disabled states */
  --muted:                oklch(0.20 0.005 248);
  --muted-foreground:     oklch(0.62 0.008 60);

  /* Accent — slightly warmer/brighter amber for hover states */
  --accent:               oklch(0.70 0.14 55);
  --accent-foreground:    oklch(0.13 0.008 248);

  /* Destructive */
  --destructive:          oklch(0.55 0.22 25);
  --destructive-foreground: oklch(0.97 0.008 60);

  /* Structure */
  --border:               oklch(0.26 0.006 248);
  --input:                oklch(0.19 0.008 248);
  --ring:                 oklch(0.75 0.14 55);

  /* Sidebar (matches darker rail variant) */
  --sidebar:              oklch(0.11 0.008 248);
  --sidebar-foreground:   oklch(0.95 0.008 60);
  --sidebar-border:       oklch(0.20 0.005 248);

  /* --- Radius scale --- */
  --radius-sm: 0.5rem;
  --radius-md: 0.95rem;
  --radius-lg: 1.5rem;
}

/* ─── Global base layer ──────────────────────────────────────────────────── */
@layer base {
  * {
    @apply border-border box-sizing-border;
  }

  body {
    @apply bg-background text-foreground font-sans;
    margin: 0;
    min-height: 100vh;
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-heading);
  }

  button,
  input,
  textarea,
  select {
    font: inherit;
  }
}
```

Key decisions to note in the file:
- Font import stays in CSS (not HTML `<link>`) because this package ships one CSS file that any app can import — the consuming app's `index.html` may already have the fonts loaded (as `packages/web` does), so the `@import` is a safe fallback (browser deduplicates identical Google Fonts requests)
- No `.dark` selector — we are dark-only; all tokens are single-mode
- `@theme inline` never hardcodes values — always `var(--token)` — single source of truth in `:root`

- [ ] Write `packages/ui/src/styles.css` with full content above
- [ ] Verify token names are consistent between `@theme inline` and `:root` block

---

#### 1.3 Write `packages/ui/src/lib/utils.ts`

```typescript
// ABOUTME: Utility for merging Tailwind class names with conflict resolution
// ABOUTME: Used by all components in the design system

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] Write `packages/ui/src/lib/utils.ts`

---

### Phase 2 — Implement the component set

Each component follows this contract:
- Uses `cva` for variant/size APIs
- Accepts `className` prop, merged via `cn()`
- Uses `@radix-ui/react-slot` for `asChild` on interactive elements
- References only Tailwind utility classes (token-derived) — no hardcoded colour values
- Exports both the component and its `variants` helper (for external composition)

---

#### 2.1 Button

```typescript
// ABOUTME: Base button component with variant and size APIs
// ABOUTME: Supports asChild for polymorphic rendering via Radix Slot

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../../lib/utils';

export const buttonVariants = cva(
  // Base styles
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium font-sans transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 hover:-translate-y-px active:translate-y-px',
  {
    variants: {
      variant: {
        default:     'bg-foreground text-background',
        primary:     'bg-primary text-primary-foreground',
        outline:     'border border-border bg-transparent text-foreground hover:bg-muted',
        ghost:       'bg-transparent text-foreground hover:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground',
      },
      size: {
        sm:   'h-8 px-3 text-sm rounded-[--radius-sm]',
        md:   'h-9 px-4 text-sm rounded-[--radius-md]',
        lg:   'h-11 px-6 text-base rounded-[--radius-md]',
        icon: 'h-9 w-9 rounded-[--radius-md]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
```

Variants in use across `packages/web`:
- `default` — primary actions (Sign in, Create Demo Project, Send, Reply)
- `ghost` — workspace/channel nav buttons (transparent, subtle hover)
- `outline` — secondary actions (Sign out, Admin Console)

- [ ] Write `packages/ui/src/components/ui/button.tsx`

---

#### 2.2 Card

```typescript
// ABOUTME: Card surface component with composable header, content, footer parts
// ABOUTME: Used for feed posts, thread messages, and admin output panels

import * as React from 'react';
import { cn } from '../../lib/utils';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-[--radius-lg] border border-border bg-card text-card-foreground',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5 p-5', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('font-heading font-semibold leading-snug', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  ),
);
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-5 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';
```

- [ ] Write `packages/ui/src/components/ui/card.tsx`

---

#### 2.3 Badge

```typescript
// ABOUTME: Badge component for labels, counts, and status indicators
// ABOUTME: Used for reply counts in channel feed posts

import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../../lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center rounded-[--radius-sm] px-2 py-0.5 text-xs font-semibold font-sans transition-colors',
  {
    variants: {
      variant: {
        default:     'bg-primary text-primary-foreground',
        secondary:   'bg-secondary text-secondary-foreground',
        outline:     'border border-border text-foreground',
        muted:       'bg-muted text-muted-foreground',
        destructive: 'bg-destructive text-destructive-foreground',
      },
    },
    defaultVariants: {
      variant: 'muted',
    },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
```

- [ ] Write `packages/ui/src/components/ui/badge.tsx`

---

#### 2.4 Input

```typescript
// ABOUTME: Base text input with consistent token-derived styling
// ABOUTME: Replaces raw <input> elements across the app

import * as React from 'react';
import { cn } from '../../lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-[--radius-md] border border-border bg-input px-3 py-1 text-sm text-foreground',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
```

- [ ] Write `packages/ui/src/components/ui/input.tsx`

---

#### 2.5 Textarea

```typescript
// ABOUTME: Base textarea with auto-consistent styling matching Input
// ABOUTME: Used for post composer, reply box, and admin message field

import * as React from 'react';
import { cn } from '../../lib/utils';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex w-full rounded-[--radius-md] border border-border bg-input px-3 py-2 text-sm text-foreground',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-45',
        'resize-vertical min-h-[80px]',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
```

- [ ] Write `packages/ui/src/components/ui/textarea.tsx`

---

#### 2.6 ScrollArea

```typescript
// ABOUTME: Radix ScrollArea with token-styled scrollbar thumb
// ABOUTME: Wraps feed-list and thread-messages for consistent overflow handling

import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import * as React from 'react';
import { cn } from '../../lib/utils';

export const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn('relative overflow-hidden', className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = 'ScrollArea';

export const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      'flex touch-none select-none transition-colors',
      orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-px',
      orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-px',
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = 'ScrollBar';
```

- [ ] Write `packages/ui/src/components/ui/scroll-area.tsx`

---

#### 2.7 Barrel exports

**`packages/ui/src/index.ts`:**
```typescript
// ABOUTME: Public API surface for the @hono-workspace/ui design system package
// ABOUTME: Re-exports all components and the cn() utility

export { cn } from './lib/utils';

export { Button, buttonVariants } from './components/ui/button';
export type { ButtonProps } from './components/ui/button';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './components/ui/card';

export { Badge, badgeVariants } from './components/ui/badge';
export type { BadgeProps } from './components/ui/badge';

export { Input } from './components/ui/input';
export type { InputProps } from './components/ui/input';

export { Textarea } from './components/ui/textarea';
export type { TextareaProps } from './components/ui/textarea';

export { ScrollArea, ScrollBar } from './components/ui/scroll-area';
```

- [ ] Write `packages/ui/src/index.ts`

---

### Phase 3 — Wire `packages/ui` into `packages/web`

#### 3.1 Update `packages/web/package.json`

Add the following dependencies:

```json
{
  "dependencies": {
    "@hono-workspace/ui": "workspace:*",
    "firebase": "12.12.0",
    "react": "19.2.5",
    "react-dom": "19.2.5"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.0",
    ...existing devDependencies...
  }
}
```

- [ ] Add `@hono-workspace/ui: workspace:*` to `packages/web/package.json` dependencies
- [ ] Add `@tailwindcss/vite` to `packages/web/package.json` devDependencies
- [ ] Run `pnpm install` from monorepo root

---

#### 3.2 Update `packages/web/vite.config.ts`

```typescript
// ABOUTME: Vite configuration for the web package
// ABOUTME: Proxies /api to a configurable backend target (local or deployed worker)

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../..', '');
  const apiTarget = env.API_TARGET ?? env.VITE_API_TARGET ?? 'http://localhost:3000';

  return {
    envDir: '../..',
    plugins: [tailwindcss(), react()],
    server: {
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
```

- [ ] Add `tailwindcss()` plugin to `packages/web/vite.config.ts`

---

#### 3.3 Rewrite `packages/web/src/styles.css`

The new file has two responsibilities only:
1. Import the design system (which brings in Tailwind + all tokens)
2. App-specific structural layout rules that carry semantic meaning not expressible as atomic utilities

All token references switch from hardcoded `rgba()`/hex to CSS custom property references.
All typographic rules are removed (now handled by the base layer in `packages/ui/src/styles.css`).

```css
/* ABOUTME: App-level styles for packages/web */
/* ABOUTME: Imports design system tokens then defines structural layout rules */

@import "@hono-workspace/ui/styles.css";

/* ─── App background ─────────────────────────────────────────────────────── */
/* Gradient overlay on the token background — specific to this app surface.  */
:root {
  --app-bg-gradient:
    radial-gradient(circle at top left,  oklch(0.55 0.22 250 / 0.18), transparent 28%),
    radial-gradient(circle at bottom right, oklch(0.75 0.14 55 / 0.14), transparent 26%);
}

body {
  background: var(--app-bg-gradient), var(--background);
}

/* ─── Shell layouts ──────────────────────────────────────────────────────── */
.admin-shell {
  display: grid;
  grid-template-columns: minmax(340px, 430px) minmax(360px, 1fr);
  gap: 1.25rem;
  padding: 1.5rem;
  min-height: 100vh;
}

.workspace-shell {
  display: grid;
  grid-template-columns: 20rem minmax(0, 1fr) 24rem;
  min-height: 100vh;
}

/* ─── Sidebar ────────────────────────────────────────────────────────────── */
.sidebar {
  background: var(--sidebar);
  border-right: 1px solid var(--sidebar-border);
  padding: 1.1rem;
  display: grid;
  gap: 1rem;
  align-content: start;
}

.sidebar-brand {
  display: grid;
  gap: 0.35rem;
}

.sidebar-actions {
  display: grid;
  gap: 0.7rem;
  margin-top: auto;
}

.workspace-channels {
  display: grid;
  gap: 0.2rem;
  margin: 0.3rem 0 0.4rem 0.85rem;
  padding-left: 0.75rem;
  border-left: 2px solid oklch(from var(--primary) l c h / 0.28);
}

.workspace-channels-actions {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.4rem;
  align-items: center;
  margin-top: 0.3rem;
}

/* ─── Channel feed ───────────────────────────────────────────────────────── */
.channel-feed {
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 100vh;
  padding: 1.1rem 1.2rem;
  gap: 1rem;
  border-right: 1px solid var(--border);
  background: oklch(from var(--background) l c h / 0.88);
  backdrop-filter: blur(20px);
}

.channel-feed-header {
  display: grid;
  gap: 0.35rem;
}

.feed-list {
  display: grid;
  gap: 0.7rem;
  align-content: start;
  min-height: 0;
  overflow: auto;
}

.composer-panel {
  display: grid;
  gap: 0.75rem;
}

/* ─── Thread drawer ──────────────────────────────────────────────────────── */
.thread-drawer {
  background: var(--sidebar);
  border-left: 1px solid var(--sidebar-border);
  padding: 1.1rem;
  display: grid;
  gap: 1rem;
  align-content: start;
}

.thread-header {
  display: grid;
  gap: 0.35rem;
}

.thread-messages {
  display: grid;
  gap: 0.7rem;
  align-content: start;
  min-height: 0;
  overflow: auto;
}

.thread-debug {
  display: grid;
  gap: 0.75rem;
}

/* ─── Admin panel ────────────────────────────────────────────────────────── */
.panel {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1.4rem;
  background: oklch(from var(--card) l c h / 0.88);
  backdrop-filter: blur(20px);
}

.admin-panel {
  display: grid;
  gap: 1rem;
  align-content: start;
}

.panel-output {
  display: grid;
  gap: 1rem;
  align-content: start;
}

/* ─── Responsive breakpoints ─────────────────────────────────────────────── */
@media (max-width: 1100px) {
  .workspace-shell {
    grid-template-columns: 18rem minmax(0, 1fr);
  }

  .thread-drawer {
    grid-column: 1 / -1;
    border-top: 1px solid var(--sidebar-border);
    border-left: 0;
  }
}

@media (max-width: 768px) {
  .admin-shell,
  .workspace-shell {
    grid-template-columns: 1fr;
  }

  .sidebar,
  .channel-feed,
  .thread-drawer {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .channel-feed {
    min-height: auto;
  }
}
```

- [ ] Rewrite `packages/web/src/styles.css` with content above
- [ ] Delete all the rules that are now covered by the `packages/ui` base layer (typography, `:root` tokens, `button`, `input`, `textarea`, `pre`, `* { box-sizing }`, `body { margin }`)

---

#### 3.4 Update `packages/web/index.html`

The Google Fonts `<link>` tags stay. They now serve as a browser-level preload hint that complements (and deduplicates) the CSS `@import` in `packages/ui/src/styles.css`. No other changes needed.

- [ ] Verify `index.html` still has both `Manrope` and `Inter Tight` preconnect + `<link>` tags (already correct from earlier session)

---

### Phase 4 — Migrate `App.tsx` to use component primitives

This phase replaces raw HTML elements with `@hono-workspace/ui` components where they improve consistency and reduce bespoke styling. The migration is surgical — only elements with clear component equivalents are migrated. Custom layout containers (`.sidebar`, `.channel-feed`, `.feed-list`, etc.) remain as named CSS class elements.

#### 4.1 Mapping table

| Current element | Replacement | Notes |
|---|---|---|
| `<button>` (Sign in/out, Create Demo Project, Admin Console, Add channel, Run Admin Test) | `<Button variant="default">` | Primary actions |
| `<button>` (Sign out, Open Chat Workspace) | `<Button variant="outline">` | Secondary actions |
| `<button className="workspace-button">` | `<Button variant="ghost">` | Keep `.workspace-button` class for layout |
| `<button className="channel-button">` | `<Button variant="ghost">` | Keep `.channel-button` class for layout |
| `<button className="feed-card-button">` | `<Button variant="ghost" asChild>` | Wrap in `<article>`, Button is the inner clickable |
| `<article className="feed-card">` | `<Card>` | Feed post cards |
| `<article className="thread-message">` | `<Card>` with role variant class | Thread messages |
| `<span>` reply count | `<Badge variant="muted">` | e.g. "2 replies" |
| `<input>` | `<Input>` | All text inputs |
| `<textarea>` | `<Textarea>` | Post composer, reply box, admin message |
| `.feed-list` container | `<ScrollArea>` | Scrollable feed |
| `.thread-messages` container | `<ScrollArea>` | Scrollable thread |
| `<pre>` in admin panel | Retain — no component equivalent | Already styled fine |

#### 4.2 Updated imports block in App.tsx

```typescript
import {
  Badge,
  Button,
  Card,
  Input,
  ScrollArea,
  Textarea,
} from '@hono-workspace/ui';
```

#### 4.3 Key JSX migration examples

**Feed card (before):**
```tsx
<article key={post.threadId} className="feed-card">
  <button
    className="feed-card-button"
    onClick={() => void handleOpenThread(post.threadId)}
    aria-label={`Open thread for ${post.rootMessageText}`}
  >
    <p className="feed-card-text">{post.rootMessageText}</p>
    <div className="feed-card-meta">
      <span>{formatReplyCount(post.replyCount)}</span>
      <span>{post.lastMessageAt ? ...}</span>
    </div>
  </button>
</article>
```

**Feed card (after):**
```tsx
<Card key={post.threadId} className="overflow-hidden">
  <Button
    variant="ghost"
    className="w-full h-auto p-4 flex-col items-start text-left"
    onClick={() => void handleOpenThread(post.threadId)}
    aria-label={`Open thread for ${post.rootMessageText}`}
  >
    <p className="feed-card-text">{post.rootMessageText}</p>
    <div className="feed-card-meta">
      <Badge variant="muted">{formatReplyCount(post.replyCount)}</Badge>
      <span>{post.lastMessageAt ? ...}</span>
    </div>
  </Button>
</Card>
```

**Thread message (before):**
```tsx
<article key={entry.id} className={`thread-message thread-message-${entry.role}`}>
  <p className="thread-message-role">{entry.role}</p>
  <p>{entry.text}</p>
</article>
```

**Thread message (after):**
```tsx
<Card
  key={entry.id}
  className={cn(
    'p-4',
    entry.role === 'user' ? 'bg-muted/40' : 'bg-primary/10',
  )}
>
  <p className="thread-message-role">{entry.role}</p>
  <p>{entry.text}</p>
</Card>
```

**Composer (before):**
```tsx
<label className="field">
  <span>Start a post</span>
  <textarea aria-label="Start a post" value={newPostMessage} ... rows={4} />
</label>
<button onClick={...} disabled={...}>Send to {selectedChannel?.name}</button>
```

**Composer (after):**
```tsx
<div className="composer-panel">
  <label className="field">
    <span>Start a post</span>
    <Textarea aria-label="Start a post" value={newPostMessage} ... rows={4} />
  </label>
  <Button onClick={...} disabled={...} variant="primary">
    Send to {selectedChannel?.name ?? 'channel'}
  </Button>
</div>
```

- [ ] Add `@hono-workspace/ui` imports to `App.tsx`
- [ ] Migrate `<button>` → `<Button>` across all action buttons
- [ ] Migrate `<article className="feed-card">` → `<Card>`
- [ ] Migrate `<article className="thread-message">` → `<Card>`
- [ ] Migrate reply count `<span>` → `<Badge variant="muted">`
- [ ] Migrate `<input>` → `<Input>` (project name, channel name, project ID, test credentials)
- [ ] Migrate `<textarea>` → `<Textarea>` (post composer, reply box, admin message)
- [ ] Wrap `.feed-list` content in `<ScrollArea>`
- [ ] Wrap `.thread-messages` content in `<ScrollArea>`
- [ ] Remove bespoke CSS classes that are now handled by component styles (`.feed-card`, `.feed-card-button`, `.feed-card-text`, `.thread-message`, `.thread-message-user`, `.thread-message-assistant`, `.thread-message-streaming`, `.thread-message-role`, `.thread-message-streaming`)

---

### Phase 5 — Verification

- [ ] Run `pnpm --filter @hono-workspace/ui typecheck` — must be clean
- [ ] Run `pnpm --filter web typecheck` — must be clean
- [ ] Run `pnpm exec vitest run` from `packages/web` — all 6 tests must pass
- [ ] Start dev server `pnpm --filter web dev` and visually verify:
  - Fonts render: Manrope on h1/h2/eyebrow, Inter Tight on body/inputs/buttons
  - Dark background with gradient visible
  - Amber accent colour on active workspace button, active channel button
  - Feed cards render with correct border-radius (not sharp, not pill-shaped)
  - Reply count badge visible
  - Composer textarea, reply textarea: styled consistently with inputs
  - Thread messages: user message slightly different from assistant message
  - ScrollArea scrollbars visible on overflow in feed and thread panes
- [ ] Verify no `rgba()` or hex values remain in `packages/web/src/styles.css` — all values use `oklch()` or `var(--token)` or `oklch(from var(--token) ...)`

---

## Risks & Mitigation

| Risk | Likelihood | Mitigation |
|---|---|---|
| Tailwind v4 `@import` resolution for workspace package CSS in Vite | Medium | `@tailwindcss/vite` handles `@import` resolution; if workspace path resolution fails, use `?inline` import or copy styles via PostCSS plugin |
| Radix `ScrollArea` changes layout height of feed/thread panes | Low | Wrap `ScrollArea` in existing layout container; `ScrollArea.Root` is `overflow-hidden`, `Viewport` is `h-full w-full` — layout neutral |
| `asChild` with `Button` inside `Card` breaks test `findByRole('button')` queries | Low | Tests find buttons by aria-label — role is still `button`, so existing queries are unaffected |
| `cva` or `tailwind-merge` version conflicts with other workspace packages | Low | These are dev/ui-package-only dependencies; no other `packages/*` currently installs them |
| Font flash on first load (CSS `@import` in ui package + `<link>` in HTML) | Very Low | Browser deduplicates identical Google Fonts requests; `display=swap` already on both |

---

## Testing Strategy

All existing tests in `packages/web` test behaviour (button clicks, API calls, text content) — not class names or CSS. They will continue to pass as long as:
1. Interactive elements remain accessible by role + aria-label (Button renders as `<button>`, which satisfies `getByRole('button')`)
2. Text content inside components is unchanged
3. The component APIs (onClick, disabled, value, onChange, aria-label) are passed through correctly

No new tests are required for this migration. The component implementations themselves are tested by their upstream libraries (Radix) or are trivially thin wrappers. If a contract test file (equivalent to simulation-web's `styles.tokens.test.ts`) is desired later, that is a separate task.

---

## Notes

- `packages/ui` is `private: true` — it is not published to npm; it is workspace-internal only
- The `exports` field in `packages/ui/package.json` uses `"."` → `./src/index.ts` directly (source, not compiled). This works because all consumers are Vite apps that can resolve TypeScript directly. If a non-Vite consumer is added later, a build step (e.g. `tsup`) would be needed.
- `packages/ui/src/styles.css` uses `@import "tailwindcss"` (Tailwind v4 syntax). The consuming app's Vite config must have `@tailwindcss/vite` installed. The CSS file alone is inert without the Vite plugin resolving the `@import`.
- The `oklch(from var(--token) l c h / alpha)` syntax (relative color syntax) requires Chrome 119+ / Firefox 128+ / Safari 16.4+. All modern browsers support it. If older browser support is needed, fall back to pre-computed `oklch()` values with alpha baked in.
- Class names on layout containers (`.sidebar`, `.workspace-shell`, `.channel-feed`, `.thread-drawer`) are intentionally kept as semantic identifiers rather than converted to Tailwind utilities — they carry structural meaning specific to this application's layout, not to the design system.
