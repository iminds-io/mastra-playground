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
