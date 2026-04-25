import { Button } from '@mastra-mindspace/ui';

import type { MobileScreen } from './useMobileNav';

export function MobileTopBar({
  screen,
  channelName,
  onOpenSidebar,
  onBack,
  onCloseThread,
  onOpenSearch,
}: {
  screen: MobileScreen;
  channelName: string;
  onOpenSidebar: () => void;
  onBack: () => void;
  onCloseThread: () => void;
  onOpenSearch: () => void;
}) {
  return (
    <div className="mobile-topbar">
      {screen === 'thread' ? (
        <>
          <Button variant="ghost" size="icon" aria-label="Back to threads" onClick={onBack}>
            ←
          </Button>
          <strong className="mobile-topbar-title">Thread</strong>
          <Button variant="ghost" size="icon" aria-label="Close thread" onClick={onCloseThread}>
            ×
          </Button>
        </>
      ) : (
        <>
          <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={onOpenSidebar}>
            ☰
          </Button>
          <strong className="mobile-topbar-title">#{channelName}</strong>
          <Button variant="ghost" size="icon" aria-label="Open search" onClick={onOpenSearch}>
            🔍
          </Button>
        </>
      )}
    </div>
  );
}
