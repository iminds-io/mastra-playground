// @vitest-environment jsdom
// ABOUTME: Tests for the ChannelList sidebar section
// ABOUTME: Covers rendering, selection, and collapsible add-channel flow

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChannelSummary } from './api';
import { ChannelList } from './ChannelList';

const CHANNELS: ChannelSummary[] = [
  { id: 'ch-1', name: 'general', slug: 'general' },
  { id: 'ch-2', name: 'engineering', slug: 'engineering' },
  { id: 'ch-3', name: 'design-review', slug: 'design-review' },
];

describe('ChannelList', () => {
  afterEach(cleanup);

  it('renders each channel with a # prefix', () => {
    render(
      <ChannelList
        channels={CHANNELS}
        selectedChannelId="ch-1"
        isCreatingChannel={false}
        channelError={undefined}
        onSelectChannel={vi.fn()}
        onCreateChannel={vi.fn()}
      />,
    );

    expect(screen.getByText('general')).toBeTruthy();
    expect(screen.getByText('engineering')).toBeTruthy();
    expect(screen.getAllByText('#').length).toBe(3);
  });

  it('highlights the selected channel', () => {
    render(
      <ChannelList
        channels={CHANNELS}
        selectedChannelId="ch-2"
        isCreatingChannel={false}
        channelError={undefined}
        onSelectChannel={vi.fn()}
        onCreateChannel={vi.fn()}
      />,
    );

    const engineeringButton = screen.getByText('engineering').closest('button');
    expect(engineeringButton?.className).toContain('channel-button-active');
  });

  it('calls onSelectChannel when a channel is clicked', () => {
    const onSelect = vi.fn();

    render(
      <ChannelList
        channels={CHANNELS}
        selectedChannelId="ch-1"
        isCreatingChannel={false}
        channelError={undefined}
        onSelectChannel={onSelect}
        onCreateChannel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('engineering'));
    expect(onSelect).toHaveBeenCalledWith('ch-2');
  });

  it('shows "+ Add channel" text link that expands to input on click', () => {
    render(
      <ChannelList
        channels={CHANNELS}
        selectedChannelId="ch-1"
        isCreatingChannel={false}
        channelError={undefined}
        onSelectChannel={vi.fn()}
        onCreateChannel={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText(/new channel name/i)).toBeNull();
    fireEvent.click(screen.getByText(/add channel/i));
    expect(screen.getByLabelText(/new channel name/i)).toBeTruthy();
  });

  it('calls onCreateChannel with the entered name', () => {
    const onCreate = vi.fn();

    render(
      <ChannelList
        channels={CHANNELS}
        selectedChannelId="ch-1"
        isCreatingChannel={false}
        channelError={undefined}
        onSelectChannel={vi.fn()}
        onCreateChannel={onCreate}
      />,
    );

    fireEvent.click(screen.getByText(/add channel/i));
    fireEvent.change(screen.getByLabelText(/new channel name/i), {
      target: { value: 'product' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    expect(onCreate).toHaveBeenCalledWith('product');
  });

  it('shows the CHANNELS section header', () => {
    render(
      <ChannelList
        channels={CHANNELS}
        selectedChannelId="ch-1"
        isCreatingChannel={false}
        channelError={undefined}
        onSelectChannel={vi.fn()}
        onCreateChannel={vi.fn()}
      />,
    );

    expect(screen.getByText('CHANNELS')).toBeTruthy();
  });
});
