// ABOUTME: Public API surface for the @hono-workspace/ui design system package
// ABOUTME: Re-exports all components and the cn() utility

export { cn } from './lib/utils';

export { Button, buttonVariants } from './components/ui/button';
export type { ButtonProps } from './components/ui/button';

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './components/ui/card';

export { Badge, badgeVariants } from './components/ui/badge';
export type { BadgeProps } from './components/ui/badge';

export { Input } from './components/ui/input';
export type { InputProps } from './components/ui/input';

export { Textarea } from './components/ui/textarea';
export type { TextareaProps } from './components/ui/textarea';

export { ScrollArea, ScrollBar } from './components/ui/scroll-area';
