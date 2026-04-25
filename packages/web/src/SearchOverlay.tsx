// ABOUTME: Search overlay for full-text search across channel messages
// ABOUTME: Renders search input, scope toggle, loading state, and result cards

import { useEffect, useRef } from 'react';

import { Card, Spinner, cn } from '@mastra-mindspace/ui';

import type { SearchResult } from './api';

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMinutes = Math.floor((now - then) / 60000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.floor(diffHours / 24)}d`;
}

function highlightTerms(text: string, query: string): React.ReactNode[] {
  if (!query.trim()) return [text];
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return text.split(regex).map((part, index) => (index % 2 === 1 ? <strong key={index}>{part}</strong> : part));
}

function snippetAround(text: string, query: string, maxLength = 120): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.trim().toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  if (index === -1 || text.length <= maxLength) return text;
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, start + maxLength);
  const snippet = text.slice(start, end);
  return `${start > 0 ? '...' : ''}${snippet}${end < text.length ? '...' : ''}`;
}

export type SearchScope = 'channel' | 'all';

export type SearchOverlayProps = {
  channelName: string;
  query: string;
  scope: SearchScope;
  results: SearchResult[];
  isLoading: boolean;
  onQueryChange: (query: string) => void;
  onScopeChange: (scope: SearchScope) => void;
  onSelectResult: (result: SearchResult) => void;
  onClose: () => void;
};

export function SearchOverlay({
  channelName,
  query,
  scope,
  results,
  isLoading,
  onQueryChange,
  onScopeChange,
  onSelectResult,
  onClose,
}: SearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="search-overlay">
      <div className="search-overlay-header">
        <input
          ref={inputRef}
          type="search"
          role="searchbox"
          className="search-overlay-input"
          placeholder={`Search #${channelName}...`}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
          }}
        />
        <button className="search-overlay-close" onClick={onClose} aria-label="Close search">
          ✕
        </button>
      </div>

      <div className="search-scope-toggle">
        <button
          className={cn('search-scope-pill', scope === 'channel' && 'search-scope-pill-active active')}
          onClick={() => onScopeChange('channel')}
        >
          This channel
        </button>
        <span className="search-scope-separator">·</span>
        <button
          className={cn('search-scope-pill', scope === 'all' && 'search-scope-pill-active active')}
          onClick={() => onScopeChange('all')}
        >
          All channels
        </button>
      </div>

      <div className="search-results">
        {isLoading ? (
          <div className="search-loading">
            <Spinner size="sm" />
            <span>Searching...</span>
          </div>
        ) : query.trim() && results.length === 0 ? (
          <p className="search-empty">No results found.</p>
        ) : (
          results.map((result) => (
            <Card key={result.messageId} className="overflow-hidden">
              <button
                className="search-result-card"
                onClick={() => onSelectResult(result)}
                aria-label={`Open thread: ${result.threadTitle ?? result.messageText.slice(0, 40)}`}
              >
                <div className="search-result-header">
                  <span className="search-result-author">{result.role === 'user' ? 'User' : 'Assistant'}</span>
                  {result.threadTitle ? (
                    <>
                      <span className="search-result-separator">·</span>
                      <span className="search-result-title">"{result.threadTitle}"</span>
                    </>
                  ) : null}
                </div>
                <p className="search-result-snippet">
                  {highlightTerms(snippetAround(result.messageText, query), query)}
                </p>
                <div className="search-result-meta">
                  <span className="search-result-channel">#{result.channelName}</span>
                  <span className="search-result-time">{formatRelativeTime(result.createdAt)}</span>
                </div>
              </button>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
