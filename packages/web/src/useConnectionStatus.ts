import { useEffect, useState } from 'react';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline' | 'reconnected';

export function useConnectionStatus() {
  const [status, setStatus] = useState<ConnectionStatus>('connected');
  const [failureCount, setFailureCount] = useState(0);

  useEffect(() => {
    const handleOffline = () => {
      setStatus((current) => (current === 'offline' ? current : 'reconnecting'));
    };

    const handleOnline = () => {
      setFailureCount(0);
      setStatus('reconnected');
      window.setTimeout(() => {
        setStatus('connected');
      }, 3000);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  function reportFailure() {
    setFailureCount((current) => {
      const next = current + 1;
      setStatus(next >= 3 ? 'offline' : 'reconnecting');
      return next;
    });
  }

  function reportSuccess() {
    setFailureCount(0);
    setStatus((current) => (current === 'connected' ? current : 'reconnected'));
    window.setTimeout(() => {
      setStatus('connected');
    }, 3000);
  }

  return {
    status,
    reportFailure,
    reportSuccess,
  };
}
