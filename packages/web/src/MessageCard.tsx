// ABOUTME: Conversation message card composed from avatar, author, timestamp, and markdown body
// ABOUTME: Subtly distinguishes mind messages from human ones without relying on background colors

import { cn } from '@mastra-mindspace/ui';

import { Avatar } from './Avatar';
import { formatTimestamp } from './formatTimestamp';
import { MarkdownBody } from './MarkdownBody';

export type MessageCardMessage = {
  id: string;
  role: string;
  text: string;
  createdAt: string;
  authorName: string;
  authorEmoji?: string | undefined;
};

type MessageCardProps = {
  message: MessageCardMessage;
  isCurrentUser?: boolean;
  className?: string | undefined;
};

export function MessageCard({ message, isCurrentUser = false, className }: MessageCardProps) {
  const isMind = message.role === 'assistant';
  const avatarProps = isCurrentUser
    ? ({ type: 'current-user', name: message.authorName } as const)
    : isMind
      ? ({ type: 'mind', name: message.authorName, emoji: message.authorEmoji ?? '🤖' } as const)
      : ({ type: 'human', name: message.authorName } as const);

  return (
    <div className={cn('message-card', isMind && 'message-card-mind', className)} data-message-id={message.id}>
      <div className="message-header">
        <Avatar {...avatarProps} />
        <span className={cn('message-author', isMind && 'message-author-mind')}>{message.authorName}</span>
        <span className="message-timestamp">{formatTimestamp(message.createdAt)}</span>
      </div>
      <div className="message-body">
        <MarkdownBody text={message.text} />
      </div>
    </div>
  );
}
