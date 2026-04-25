// ABOUTME: Rich thread card for the channel feed index
// ABOUTME: Shows author, timestamp, message preview, reply count, and selected state

import { Card, cn } from '@mastra-mindspace/ui';

import type { ChannelFeedPost } from './api';
import { formatTimestamp } from './formatTimestamp';

export type ThreadCardProps = {
  post: ChannelFeedPost;
  isSelected: boolean;
  streamingMindName?: string | undefined;
  now?: Date;
  onClick: () => void;
};

function formatAuthorName(role: string): string {
  if (role === 'user') {
    return 'You';
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
}

function formatReplyCount(count: number): string {
  return `${count} ${count === 1 ? 'reply' : 'replies'}`;
}

export function ThreadCard({ post, isSelected, streamingMindName, now, onClick }: ThreadCardProps) {
  const currentTime = now ?? new Date();

  return (
    <Card className="overflow-hidden">
      <button
        className={cn('feed-card-button', isSelected && 'feed-card-active')}
        onClick={onClick}
        aria-label={`Open thread for ${post.rootMessageText}`}
      >
        <div className="feed-card-header">
          <span className="feed-card-author">{formatAuthorName(post.rootMessageRole)}</span>
          <span className="feed-card-timestamp">{formatTimestamp(post.createdAt, currentTime)}</span>
        </div>

        <p className="feed-card-text">{post.rootMessageText}</p>

        {post.replyCount > 0 ? (
          <div className="feed-card-meta">
            <span className="feed-card-replies">{formatReplyCount(post.replyCount)}</span>
            <span className="feed-card-activity">
              {streamingMindName ? `${streamingMindName} is thinking...` : formatTimestamp(post.lastMessageAt, currentTime)}
            </span>
          </div>
        ) : null}
      </button>
    </Card>
  );
}
