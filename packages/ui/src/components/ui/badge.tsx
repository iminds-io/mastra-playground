// ABOUTME: Badge component for labels, counts, and status indicators
// ABOUTME: Used for reply counts in channel feed posts

import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../../lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center rounded-[--radius-sm] px-2 py-0.5 text-xs font-semibold transition-colors',
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
