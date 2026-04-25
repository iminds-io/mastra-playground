// ABOUTME: Thread detail header with author/channel/timestamp context and close affordance
// ABOUTME: Provides orientation for the conversation and preserves the close interaction

import { Button } from '@mastra-mindspace/ui';

import { formatTimestamp } from './formatTimestamp';

type ThreadHeaderProps = {
  authorName: string;
  channelName: string;
  createdAt: string;
  onClose?: () => void;
};

export function ThreadHeader({ authorName, channelName, createdAt, onClose }: ThreadHeaderProps) {
  return (
    <header className="thread-header">
      <div className="thread-header-row">
        <p className="eyebrow">Thread</p>
        {onClose ? (
          <Button variant="ghost" size="icon" aria-label="Close thread" onClick={onClose}>
            &times;
          </Button>
        ) : null}
      </div>
      <p className="thread-context">
        Started by {authorName} · #{channelName} · {formatTimestamp(createdAt)}
      </p>
    </header>
  );
}
