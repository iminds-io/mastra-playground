// ABOUTME: Channel feed panel extracted from App.tsx
// ABOUTME: Shows feed loading, root post cards, and the new-post composer

import { useRef, useState, type KeyboardEventHandler } from 'react';

import { Button, Spinner, Textarea } from '@mastra-mindspace/ui';

import type { ChannelFeedPost, ChannelSummary, SearchResult } from './api';
import { InlineError } from './InlineError';
import { SearchOverlay, type SearchScope } from './SearchOverlay';
import { ThreadCard } from './ThreadCard';

export type ChannelFeedProps = {
  selectedChannel: ChannelSummary | null;
  feedPosts: ChannelFeedPost[];
  selectedThreadId: string | null;
  streamingMinds?: Record<string, string>;
  newPostMessage: string;
  isFeedLoading: boolean;
  isCreatingPost: boolean;
  feedError: string | undefined;
  onOpenThread: (threadId: string) => void;
  onChangeNewPostMessage: (message: string) => void;
  onCreatePost: () => void;
  onComposerKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onRefreshFeed: () => void;
  isSearchOpen: boolean;
  searchQuery: string;
  searchScope: SearchScope;
  searchResults: SearchResult[];
  isSearching: boolean;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  onChangeSearchQuery: (query: string) => void;
  onChangeSearchScope: (scope: SearchScope) => void;
  onSelectSearchResult: (result: SearchResult) => void;
};

export function ChannelFeed({
  selectedChannel,
  feedPosts,
  selectedThreadId,
  streamingMinds = {},
  newPostMessage,
  isFeedLoading,
  isCreatingPost,
  feedError,
  onOpenThread,
  onChangeNewPostMessage,
  onCreatePost,
  onComposerKeyDown,
  onRefreshFeed,
  isSearchOpen,
  searchQuery,
  searchScope,
  searchResults,
  isSearching,
  onOpenSearch,
  onCloseSearch,
  onChangeSearchQuery,
  onChangeSearchScope,
  onSelectSearchResult,
}: ChannelFeedProps) {
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [isComposerExpanded, setIsComposerExpanded] = useState(false);
  const composerRows = isComposerExpanded || newPostMessage.length > 0 ? 4 : 1;
  const shortcutHint = window.navigator.platform?.includes('Mac') ? '⌘⏎' : 'Ctrl+Enter';

  return (
    <section className="channel-feed">
      <header className="channel-feed-header">
        <div className="channel-feed-header-row">
          <h2>#{selectedChannel?.name ?? 'Select a channel'}</h2>
          <div className="channel-feed-header-actions">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh feed"
              onClick={onRefreshFeed}
              disabled={isFeedLoading}
            >
              &#x27F3;
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Search messages"
              onClick={onOpenSearch}
              disabled={!selectedChannel}
            >
              &#128269;
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="New thread"
              onClick={() => {
                if (typeof composerRef.current?.scrollIntoView === 'function') {
                  composerRef.current.scrollIntoView({ behavior: 'smooth' });
                }
                composerRef.current?.focus();
              }}
            >
              + New
            </Button>
          </div>
        </div>
        <p className="channel-status">
          {isFeedLoading ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <Spinner size="sm" /> Loading feed...
            </span>
          ) : (
            'Thread roots appear here.'
          )}
        </p>
      </header>

      <div className="feed-body">
        {isSearchOpen ? (
          <SearchOverlay
            channelName={selectedChannel?.name ?? 'channel'}
            query={searchQuery}
            scope={searchScope}
            results={searchResults}
            isLoading={isSearching}
            onQueryChange={onChangeSearchQuery}
            onScopeChange={onChangeSearchScope}
            onSelectResult={onSelectSearchResult}
            onClose={onCloseSearch}
          />
        ) : (
          <div className="feed-list">
            {isFeedLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                <Spinner size="lg" />
              </div>
            ) : feedPosts.length === 0 ? (
              <p className="empty-state">No channel posts yet.</p>
            ) : (
              feedPosts.map((post) => (
                <ThreadCard
                  key={post.threadId}
                  post={post}
                  isSelected={selectedThreadId === post.threadId}
                  streamingMindName={streamingMinds[post.threadId]}
                  onClick={() => onOpenThread(post.threadId)}
                />
              ))
            )}
          </div>
        )}
      </div>

      <div className="composer-panel">
        <InlineError message={feedError} />
        <div className="composer-wrapper">
          <Textarea
            ref={composerRef}
            aria-label="Start a post"
            value={newPostMessage}
            onChange={(event) => onChangeNewPostMessage(event.target.value)}
            onKeyDown={onComposerKeyDown}
            onFocus={() => setIsComposerExpanded(true)}
            onBlur={() => {
              if (!newPostMessage) {
                setIsComposerExpanded(false);
              }
            }}
            rows={composerRows}
            placeholder={`Start a new thread in #${selectedChannel?.name ?? 'channel'}...`}
          />
          <span className="composer-hint">{shortcutHint}</span>
        </div>

        <Button onClick={onCreatePost} disabled={!selectedChannel || isCreatingPost}>
          {`Send to ${selectedChannel?.name ?? 'channel'}`}
        </Button>
      </div>
    </section>
  );
}
