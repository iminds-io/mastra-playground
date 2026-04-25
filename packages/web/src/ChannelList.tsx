// ABOUTME: Sidebar channel list with collapsible inline add-channel form
// ABOUTME: Channels remain the primary navigation target inside an active project

import { useState } from 'react';

import { Button, Input } from '@mastra-mindspace/ui';

import type { ChannelSummary } from './api';
import { InlineError } from './InlineError';

export type ChannelListProps = {
  channels: ChannelSummary[];
  selectedChannelId: string;
  isCreatingChannel: boolean;
  channelError: string | undefined;
  onSelectChannel: (channelId: string) => void;
  onCreateChannel: (name: string) => void;
};

export function ChannelList({
  channels,
  selectedChannelId,
  isCreatingChannel,
  channelError,
  onSelectChannel,
  onCreateChannel,
}: ChannelListProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');

  function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) {
      return;
    }

    onCreateChannel(trimmed);
    setNewName('');
    setIsAdding(false);
  }

  return (
    <section className="sidebar-section">
      <p className="eyebrow">CHANNELS</p>

      <nav className="channel-list" aria-label="Channels">
        {channels.map((channel) => (
          <button
            key={channel.id}
            className={channel.id === selectedChannelId ? 'channel-button channel-button-active' : 'channel-button'}
            onClick={() => onSelectChannel(channel.id)}
          >
            <span className="channel-hash">#</span>
            <span>{channel.name}</span>
          </button>
        ))}
      </nav>

      {isAdding ? (
        <div className="channel-add-form">
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="channel-name"
            aria-label="New channel name"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleAdd();
              }
              if (event.key === 'Escape') {
                setIsAdding(false);
                setNewName('');
              }
            }}
          />
          <Button size="sm" onClick={handleAdd} disabled={isCreatingChannel || !newName.trim()}>
            Add
          </Button>
        </div>
      ) : (
        <button className="channel-add-link" onClick={() => setIsAdding(true)}>
          + Add channel
        </button>
      )}

      <InlineError message={channelError} />
    </section>
  );
}
