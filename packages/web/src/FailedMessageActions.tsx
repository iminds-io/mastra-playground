export function FailedMessageActions({
  onRetry,
  onDiscard,
}: {
  onRetry: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="failed-message-actions">
      <button type="button" className="failed-message-button" onClick={onRetry}>
        Retry
      </button>
      <button type="button" className="failed-message-button" onClick={onDiscard}>
        Discard
      </button>
    </div>
  );
}
