// ABOUTME: Shared avatar primitive supporting both simple sidebar usage and rich conversation variants
// ABOUTME: Handles initials, mind emoji, and current-user ring styling with deterministic human colors

import { cn } from '@mastra-mindspace/ui';

import { getAvatarColor, getInitials } from './avatarColor';

type LegacyAvatarProps = {
  variant: 'initials' | 'icon';
  text: string;
  size?: 'sm' | 'md';
  type?: never;
  name?: never;
  emoji?: never;
};

type RichAvatarProps =
  | {
      type: 'human';
      name: string;
      emoji?: never;
      size?: 'sm' | 'md';
      variant?: never;
      text?: never;
    }
  | {
      type: 'mind';
      name: string;
      emoji: string;
      size?: 'sm' | 'md';
      variant?: never;
      text?: never;
    }
  | {
      type: 'current-user';
      name: string;
      emoji?: never;
      size?: 'sm' | 'md';
      variant?: never;
      text?: never;
    };

export type AvatarProps = LegacyAvatarProps | RichAvatarProps;

export function Avatar(props: AvatarProps) {
  if ('variant' in props) {
    const { variant, text, size = 'md' } = props;
    return (
      <span
        className={cn('avatar', `avatar-${size}`, variant === 'icon' && 'avatar-accent-ring')}
        aria-hidden="true"
      >
        {text}
      </span>
    );
  }

  const { type, name, emoji, size = 'md' } = props;
  const isMind = type === 'mind';
  const isCurrentUser = type === 'current-user';
  const content = isMind ? emoji : getInitials(name);
  const backgroundColor = isMind ? undefined : getAvatarColor(name);

  return (
    <span
      className={cn(
        'avatar',
        `avatar-${size}`,
        isMind && 'avatar-ring-accent',
        isCurrentUser && 'avatar-ring-primary',
      )}
      style={backgroundColor ? { backgroundColor } : undefined}
      aria-label={name}
      role="img"
    >
      {content}
    </span>
  );
}
