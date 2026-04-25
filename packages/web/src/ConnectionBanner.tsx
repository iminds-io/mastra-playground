import type { ConnectionStatus } from './useConnectionStatus';

export function ConnectionBanner({
  status,
  onRetry,
}: {
  status: ConnectionStatus;
  onRetry?: () => void;
}) {
  if (status === 'connected') {
    return null;
  }

  if (status === 'offline') {
    return (
      <div role="alert" className="connection-banner connection-banner-destructive">
        <span>Unable to connect. Working offline.</span>
        {onRetry ? (
          <button type="button" className="connection-banner-action" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  if (status === 'reconnected') {
    return (
      <div role="status" className="connection-banner connection-banner-success">
        Connected again.
      </div>
    );
  }

  return (
    <div role="status" className="connection-banner connection-banner-warning">
      Connection lost. Reconnecting…
    </div>
  );
}
