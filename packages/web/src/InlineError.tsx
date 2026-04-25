// ABOUTME: Small inline error banner for scoped frontend errors
// ABOUTME: Used near the UI region that triggered the failed action

export function InlineError({
  message,
  onDismiss,
}: {
  message: string | undefined;
  onDismiss?: () => void;
}) {
  if (!message) return null;

  return (
    <div role="alert" className="inline-error">
      <span>{message}</span>
      {onDismiss ? (
        <button type="button" className="inline-error-dismiss" onClick={onDismiss} aria-label="Dismiss error">
          ×
        </button>
      ) : null}
    </div>
  );
}
