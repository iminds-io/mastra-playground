// @vitest-environment jsdom
// ABOUTME: Tests for the SearchOverlay component rendering and interactions
// ABOUTME: Covers input, scope toggle, result cards, close behavior, and keyboard handling

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SearchResult } from './api';
import { SearchOverlay } from './SearchOverlay';

const sampleResults: SearchResult[] = [
  {
    messageId: 'msg-1',
    threadId: 'thread-1',
    channelId: 'channel-1',
    channelName: 'engineering',
    messageText: 'We need to deploy the auth fix before 5pm',
    threadTitle: 'Deploy auth fix',
    role: 'user',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
];

describe('SearchOverlay', () => {
  afterEach(cleanup);

  const defaultProps = {
    channelName: 'engineering',
    query: '',
    scope: 'channel' as const,
    results: [] as SearchResult[],
    isLoading: false,
    onQueryChange: vi.fn(),
    onScopeChange: vi.fn(),
    onSelectResult: vi.fn(),
    onClose: vi.fn(),
  };

  it('renders search input with channel name placeholder', () => {
    render(<SearchOverlay {...defaultProps} />);
    expect(screen.getByRole('searchbox').getAttribute('placeholder')).toBe('Search #engineering...');
  });

  it('renders scope toggle buttons', () => {
    render(<SearchOverlay {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'This channel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All channels' })).toBeTruthy();
  });

  it('highlights active scope', () => {
    render(<SearchOverlay {...defaultProps} scope="channel" />);
    expect(screen.getByRole('button', { name: 'This channel' }).className).toContain('active');
  });

  it('calls onScopeChange when scope button is clicked', () => {
    const onScopeChange = vi.fn();
    render(<SearchOverlay {...defaultProps} onScopeChange={onScopeChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'All channels' }));
    expect(onScopeChange).toHaveBeenCalledWith('all');
  });

  it('renders result cards', () => {
    render(<SearchOverlay {...defaultProps} results={sampleResults} />);
    expect(screen.getByText(/deploy auth fix/i)).toBeTruthy();
    expect(screen.getByText('#engineering')).toBeTruthy();
  });

  it('calls onSelectResult when result card is clicked', () => {
    const onSelectResult = vi.fn();
    render(<SearchOverlay {...defaultProps} results={sampleResults} onSelectResult={onSelectResult} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Open thread/ })[0]!);
    expect(onSelectResult).toHaveBeenCalledWith(sampleResults[0]);
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<SearchOverlay {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close search' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<SearchOverlay {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onQueryChange when input value changes', () => {
    const onQueryChange = vi.fn();
    render(<SearchOverlay {...defaultProps} onQueryChange={onQueryChange} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'deploy' } });
    expect(onQueryChange).toHaveBeenCalledWith('deploy');
  });

  it('shows empty state when query exists but no results', () => {
    render(<SearchOverlay {...defaultProps} query="xyznotfound" results={[]} />);
    expect(screen.getByText(/No results/)).toBeTruthy();
  });

  it('shows loading spinner when isLoading is true', () => {
    render(<SearchOverlay {...defaultProps} query="deploy" isLoading />);
    expect(screen.getByText('Searching...')).toBeTruthy();
  });
});
