// ABOUTME: Minimal component-based router for the small web app surface
// ABOUTME: Provides route matching, param extraction, and imperative navigation

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type RouteParams = Record<string, string>;

type RouteContextValue = {
  path: string;
  params: RouteParams;
  navigate: (path: string) => void;
};

const RouteContext = createContext<RouteContextValue>({
  path: '/',
  params: {},
  navigate: () => {},
});

export function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useRoute() {
  return useContext(RouteContext);
}

function matchPath(pattern: string, pathname: string): RouteParams | null {
  const patternSegments = pattern.split('/').filter(Boolean);
  const pathSegments = pathname.split('/').filter(Boolean);

  if (patternSegments.length === 0 && pathSegments.length === 0) {
    return {};
  }

  if (patternSegments.length !== pathSegments.length) {
    return null;
  }

  const params: RouteParams = {};

  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternPart = patternSegments[index];
    const pathPart = pathSegments[index];

    if (!patternPart || !pathPart) {
      return null;
    }

    if (patternPart.startsWith(':')) {
      params[patternPart.slice(1)] = decodeURIComponent(pathPart);
      continue;
    }

    if (patternPart !== pathPart) {
      return null;
    }
  }

  return params;
}

export function Router({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setPath(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const contextValue = useMemo(
    () => ({
      path,
      params: {},
      navigate,
    }),
    [path],
  );

  return <RouteContext.Provider value={contextValue}>{children}</RouteContext.Provider>;
}

export function Route({ path: pattern, children }: { path: string; children: ReactNode }) {
  const currentRoute = useContext(RouteContext);
  const match = matchPath(pattern, currentRoute.path);

  if (!match) {
    return null;
  }

  return (
    <RouteContext.Provider
      value={{
        path: currentRoute.path,
        params: match,
        navigate,
      }}
    >
      {children}
    </RouteContext.Provider>
  );
}
