// ABOUTME: Animated loading spinner using CSS utility classes
// ABOUTME: Sized for inline use in buttons, headers, and centered loading states

import * as React from 'react';

import { cn } from '../../lib/utils';

export type SpinnerProps = React.HTMLAttributes<HTMLSpanElement> & {
  size?: 'sm' | 'md' | 'lg';
};

const sizeClasses = {
  sm: 'h-4 w-4 border-[1.5px]',
  md: 'h-5 w-5 border-2',
  lg: 'h-6 w-6 border-2',
} as const;

export const Spinner = React.forwardRef<HTMLSpanElement, SpinnerProps>(
  ({ className, size = 'md', ...props }, ref) => (
    <span
      ref={ref}
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block animate-spin rounded-full border-muted-foreground/30 border-t-primary',
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  ),
);

Spinner.displayName = 'Spinner';
