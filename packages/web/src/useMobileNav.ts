import { useEffect, useState } from 'react';

export type MobileScreen = 'index' | 'thread' | 'search';

export function useMobileNav() {
  const getIsMobile = () => window.innerWidth <= 768;
  const [isMobile, setIsMobile] = useState(getIsMobile);
  const [screen, setScreen] = useState<MobileScreen>('index');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    const onChange = (event: MediaQueryListEvent | { matches: boolean }) => {
      setIsMobile(event.matches);
      if (!event.matches) {
        setScreen('index');
        setIsSidebarOpen(false);
      }
    };

    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return {
    isMobile,
    screen,
    isSidebarOpen,
    pushThread() {
      setScreen('thread');
      setIsSidebarOpen(false);
    },
    pushSearch() {
      setScreen('search');
      setIsSidebarOpen(false);
    },
    popScreen() {
      setScreen('index');
    },
    openSidebar() {
      setIsSidebarOpen(true);
    },
    closeSidebar() {
      setIsSidebarOpen(false);
    },
    resetStack() {
      setScreen('index');
      setIsSidebarOpen(false);
    },
  };
}
