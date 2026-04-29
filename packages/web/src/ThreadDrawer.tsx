// ABOUTME: Thread drawer extracted from App.tsx
// ABOUTME: Owns thread auto-scroll and renders loading, messages, and reply UI

import { useEffect, useRef, type KeyboardEventHandler } from 'react';

import { Spinner } from '@mastra-mindspace/ui';

import type { ThreadMessage, ThreadSummary } from './api';
import { FailedMessageActions } from './FailedMessageActions';
import { InlineError } from './InlineError';
import { MessageCard } from './MessageCard';
import { ReplyComposer, type MindChip } from './ReplyComposer';
import { StreamingMessageCard } from './StreamingMessageCard';
import { ThreadHeader } from './ThreadHeader';

export type ThreadDrawerProps = {
  selectedThread: ThreadSummary | null;
  channelName: string;
  threadMessages: ThreadMessage[];
  streamingReply: string;
  assistantPending: boolean;
  replyMessage: string;
  isThreadLoading: boolean;
  isReplying: boolean;
  currentUserName?: string;
  minds: MindChip[];
  threadError: string | undefined;
  interruptedNotice?: string | undefined;
  onClose: () => void;
  onChangeReplyMessage: (message: string) => void;
  onReply: () => void;
  onReplyKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onRetryFailedMessage: (messageId: string) => void;
  onDiscardFailedMessage: (messageId: string) => void;
};

export function ThreadDrawer({
  selectedThread,
  channelName,
  threadMessages,
  streamingReply,
  assistantPending,
  replyMessage,
  isThreadLoading,
  isReplying,
  currentUserName,
  minds,
  threadError,
  interruptedNotice,
  onClose,
  onChangeReplyMessage,
  onReply: _onReply,
  onReplyKeyDown,
  onRetryFailedMessage,
  onDiscardFailedMessage,
}: ThreadDrawerProps) {
  const threadBottomRef = useRef<HTMLDivElement>(null);
  const rootMessage = threadMessages[0] ?? null;
  const threadAuthorName =
    rootMessage?.role === 'user'
      ? currentUserName ?? 'You'
      : rootMessage?.role === 'assistant'
        ? minds[0]?.name ?? 'Assistant'
        : rootMessage?.role
          ? rootMessage.role.charAt(0).toUpperCase() + rootMessage.role.slice(1)
          : 'Unknown';

  useEffect(() => {
    threadBottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [threadMessages, streamingReply]);

  return (
    <aside className="thread-drawer">
      {selectedThread ? (
        <ThreadHeader
          authorName={threadAuthorName}
          channelName={channelName}
          createdAt={selectedThread.createdAt}
          onClose={onClose}
        />
      ) : (
        <header className="thread-header">
          <div className="thread-header-row">
            <p className="eyebrow">Thread</p>
          </div>
          <p className="thread-context">Choose a thread to open the full conversation.</p>
        </header>
      )}

      <div className="thread-messages">
        {isThreadLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <Spinner size="lg" />
          </div>
        ) : threadMessages.length === 0 ? (
          <p className="empty-state">No thread selected.</p>
        ) : (
          threadMessages.map((entry) => (
            <div key={entry.id} className={entry.sendFailed ? 'thread-message-failed' : undefined}>
              <MessageCard
                message={{
                  id: entry.id,
                  role: entry.role,
                  text: entry.text,
                  createdAt: entry.createdAt,
                  authorName:
                    entry.role === 'user'
                      ? currentUserName ?? 'You'
                      : entry.role === 'assistant'
                        ? minds[0]?.name ?? 'Assistant'
                        : entry.role.charAt(0).toUpperCase() + entry.role.slice(1),
                  authorEmoji: entry.role === 'assistant' ? minds[0]?.emoji ?? '🤖' : undefined,
                }}
                isCurrentUser={entry.role === 'user'}
                className={entry.sendFailed ? 'message-card-failed' : undefined}
              />
              {entry.sendFailed ? (
                <FailedMessageActions
                  onRetry={() => onRetryFailedMessage(entry.id)}
                  onDiscard={() => onDiscardFailedMessage(entry.id)}
                />
              ) : null}
            </div>
          ))
        )}
        {assistantPending || streamingReply ? (
          <StreamingMessageCard
            text={streamingReply}
            mindName={minds[0]?.name ?? 'Assistant'}
            mindEmoji={minds[0]?.emoji ?? '🤖'}
          />
        ) : null}
        <div ref={threadBottomRef} />
      </div>

      <InlineError message={threadError} />
      {interruptedNotice ? <p className="stream-interrupted-notice">{interruptedNotice}</p> : null}
      <ReplyComposer
        value={replyMessage}
        onChange={onChangeReplyMessage}
        onSubmit={() => {}}
        onKeyDown={onReplyKeyDown}
        disabled={!selectedThread || isReplying}
        minds={minds}
      />
    </aside>
  );
}
