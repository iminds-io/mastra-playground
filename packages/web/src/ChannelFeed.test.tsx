// @vitest-environment jsdom
// ABOUTME: Tests for the ChannelFeed component — header buttons, composer, and feed rendering
// ABOUTME: Validates refresh, new-thread focus, and collapsing composer interactions

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChannelFeedPost, ChannelSummary } from './api';
import { ChannelFeed } from './ChannelFeed';

const defaultChannel: ChannelSummary = {
  id: 'ch-1',
  name: 'engineering',
  slug: 'engineering',
};

const defaultProps = {
  selectedChannel: defaultChannel,
  feedPosts: [] as ChannelFeedPost[],
  selectedThreadId: null,
  streamingMinds: {},
  newPostMessage: '',
  isFeedLoading: false,
  isCreatingPost: false,
  feedError: undefined,
  onOpenThread: vi.fn(),
  onChangeNewPostMessage: vi.fn(),
  onCreatePost: vi.fn(),
  onComposerKeyDown: vi.fn(),
  onRefreshFeed: vi.fn(),
  isSearchOpen: false,
  searchQuery: '',
  searchScope: 'channel' as const,
  searchResults: [],
  isSearching: false,
  onOpenSearch: vi.fn(),
  onCloseSearch: vi.fn(),
  onChangeSearchQuery: vi.fn(),
  onChangeSearchScope: vi.fn(),
  onSelectSearchResult: vi.fn(),
};

describe('ChannelFeed', () => {
  afterEach(cleanup);

  it('renders the channel name with # prefix', () => {
    render(<ChannelFeed {...defaultProps} />);
    expect(screen.getByText('#engineering')).toBeTruthy();
  });

  it('renders a refresh button that calls onRefreshFeed', () => {
    const onRefreshFeed = vi.fn();
    render(<ChannelFeed {...defaultProps} onRefreshFeed={onRefreshFeed} />);

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    expect(onRefreshFeed).toHaveBeenCalledOnce();
  });

  it('renders a search button that calls onOpenSearch', () => {
    const onOpenSearch = vi.fn();
    render(<ChannelFeed {...defaultProps} onOpenSearch={onOpenSearch} />);

    fireEvent.click(screen.getByRole('button', { name: /search messages/i }));
    expect(onOpenSearch).toHaveBeenCalledOnce();
  });

  it('renders a "+ New" button', () => {
    render(<ChannelFeed {...defaultProps} />);
    expect(screen.getByRole('button', { name: /new thread/i })).toBeTruthy();
  });

  it('focuses the composer when "+ New" is clicked', () => {
    render(<ChannelFeed {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));

    const composer = screen.getByPlaceholderText(/start a new thread/i);
    expect(document.activeElement).toBe(composer);
  });

  it('disables refresh button while feed is loading', () => {
    render(<ChannelFeed {...defaultProps} isFeedLoading />);
    expect(screen.getByRole('button', { name: /refresh/i })).toHaveProperty('disabled', true);
  });

  it('renders the search overlay when open', () => {
    render(
      <ChannelFeed
        {...defaultProps}
        isSearchOpen
        searchQuery="deploy"
        searchResults={[
          {
            messageId: 'msg-1',
            threadId: 'thread-1',
            channelId: 'ch-1',
            channelName: 'engineering',
            messageText: 'Deploy the auth fix before 5pm',
            threadTitle: 'Deploy auth fix',
            role: 'user',
            createdAt: new Date().toISOString(),
          },
        ]}
      />,
    );

    expect(screen.getByRole('searchbox')).toBeTruthy();
    expect(screen.getByText(/deploy auth fix/i)).toBeTruthy();
  });
});

describe('ChannelFeed composer', () => {
  afterEach(cleanup);

  it('renders the composer with 1 row by default', () => {
    render(<ChannelFeed {...defaultProps} />);
    expect(screen.getByPlaceholderText(/start a new thread/i).getAttribute('rows')).toBe('1');
  });

  it('expands to 4 rows on focus', () => {
    render(<ChannelFeed {...defaultProps} />);
    const composer = screen.getByPlaceholderText(/start a new thread/i);
    fireEvent.focus(composer);
    expect(composer.getAttribute('rows')).toBe('4');
  });

  it('collapses back to 1 row on blur when empty', () => {
    render(<ChannelFeed {...defaultProps} />);
    const composer = screen.getByPlaceholderText(/start a new thread/i);
    fireEvent.focus(composer);
    fireEvent.blur(composer);
    expect(composer.getAttribute('rows')).toBe('1');
  });

  it('stays expanded on blur when text is present', () => {
    render(<ChannelFeed {...defaultProps} newPostMessage="draft text" />);
    const composer = screen.getByPlaceholderText(/start a new thread/i);
    fireEvent.focus(composer);
    fireEvent.blur(composer);
    expect(composer.getAttribute('rows')).toBe('4');
  });

  it('displays a keyboard shortcut hint', () => {
    render(<ChannelFeed {...defaultProps} />);
    expect(screen.getByText(/[⌘⏎]|Cmd.*Enter|Ctrl.*Enter/i)).toBeTruthy();
  });
});
