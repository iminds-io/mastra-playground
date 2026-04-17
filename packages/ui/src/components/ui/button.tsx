// ABOUTME: Base button component with variant and size APIs
// ABOUTME: Supports asChild for polymorphic rendering via Radix Slot

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../../lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 hover:-translate-y-px active:translate-y-px',
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
