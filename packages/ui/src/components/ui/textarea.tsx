// ABOUTME: Base textarea with consistent styling matching Input
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
