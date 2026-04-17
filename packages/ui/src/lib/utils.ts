// ABOUTME: Utility for merging Tailwind class names with conflict resolution
// ABOUTME: Used by all components in the design system

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
