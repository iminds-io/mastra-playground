// ABOUTME: Streaming message card for in-progress AI responses
// ABOUTME: Shows dashed border, typing indicator, and blinking cursor during token streaming

import { Avatar } from './Avatar';

type StreamingMessageCardProps = {
  text: string;
  mindName: string;
  mindEmoji: string;
};

export function StreamingMessageCard({ text, mindName, mindEmoji }: StreamingMessageCardProps) {
  return (
    <div className="message-card message-card-streaming">
      <div className="message-header">
        <Avatar type="mind" name={mindName} emoji={mindEmoji} />
        <span className="message-author message-author-mind">{mindName}</span>
        <span className="message-timestamp streaming-indicator">● typing...</span>
      </div>
      <div className="message-body">
        {text ? (
          <p>
            {text}
            <span className="streaming-cursor" aria-hidden="true">
              ▊
            </span>
          </p>
        ) : (
          <p className="streaming-placeholder">
            <span className="streaming-cursor" aria-hidden="true">
              ▊
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
