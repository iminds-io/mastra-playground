// ABOUTME: Reply composer with textarea and mind mention chips
// ABOUTME: Mind chips append @mentions into the reply text to guide agent routing

import type { KeyboardEventHandler } from 'react';

import { Textarea } from '@mastra-mindspace/ui';

export type MindChip = {
  name: string;
  emoji: string;
};

type ReplyComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  disabled: boolean;
  minds: MindChip[];
};

export function ReplyComposer({ value, onChange, onSubmit: _onSubmit, onKeyDown, disabled, minds }: ReplyComposerProps) {
  function handleChipClick(mindName: string) {
    onChange(`${value}@${mindName} `);
  }

  return (
    <div className="reply-composer">
      <div className="reply-composer-input">
        <Textarea
          placeholder="Reply to this thread..."
          aria-label="Reply to this thread"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          disabled={disabled}
        />
        <span className="reply-composer-hint">⌘⏎</span>
      </div>
      {minds.length > 0 ? (
        <div className="reply-composer-chips">
          {minds.map((mind) => (
            <button
              key={mind.name}
              type="button"
              className="mention-chip"
              onClick={() => handleChipClick(mind.name)}
              disabled={disabled}
              aria-label={`@${mind.name}`}
            >
              <span className="mention-chip-emoji">{mind.emoji}</span>
              @{mind.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
