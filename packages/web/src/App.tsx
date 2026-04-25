import { useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@mastra-mindspace/ui';

import {
  archiveProjectSettings,
  bootstrapProject,
  createChannelPost,
  createProjectChannel,
  getChannelThread,
  getMe,
  getProjectSettingsGeneral,
  inviteProjectMember,
  listAccessibleProjects,
  listChannelFeed,
  listProjectMindConfigs,
  listProjectChannels,
  listProjectSettingsMembers,
  removeProjectMember,
  runAdminTest,
  searchMessages,
  StreamInterruptedError,
  streamThreadReply,
  updateProjectMindConfig,
  updateProjectSettingsGeneral,
  type AccessibleProjectSummary,
  type ChannelFeedPost,
  type ChannelSummary,
  type ProjectSettingsGeneral,
  type ProjectSettingsMembers,
  type ProjectSettingsMinds,
  type SearchResult,
  type ThreadMessage,
  type ThreadSummary,
} from './api';
import { auth, onAuthStateChanged, signInWithEmailPassword, signInWithGoogle, signOutUser } from './firebase';
import { AdminConsole } from './AdminConsole';
import { ConnectionBanner } from './ConnectionBanner';
import { MobileTopBar } from './MobileTopBar';
import { PostAuthRouter } from './PostAuthRouter';
import { SettingsModal } from './SettingsModal';
import { SignIn } from './SignIn';
import { Sidebar } from './Sidebar';
import { STUB_MINDS, STUB_TEAMMATES } from './sidebar-stubs';
import { ChannelFeed } from './ChannelFeed';
import type { SearchScope } from './SearchOverlay';
import { ThreadDrawer } from './ThreadDrawer';
import { humanizeError } from './humanizeError';
import { Route, navigate, useRoute } from './router';
import { useChannelEvents } from './useChannelEvents';
import { useConnectionStatus } from './useConnectionStatus';
import { useMobileNav } from './useMobileNav';
import { useTheme } from './useTheme';
import './styles.css';

type AuthUser = {
  uid: string;
  email: string | null;
  getIdToken(): Promise<string>;
};

function mergeProjects(
  current: AccessibleProjectSummary[],
  incoming: AccessibleProjectSummary[],
): AccessibleProjectSummary[] {
  const map = new Map<string, AccessibleProjectSummary>();

  for (const project of current) {
    map.set(project.id, project);
  }

  for (const project of incoming) {
    map.set(project.id, project);
  }

  return [...map.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function getChatProjectId(path: string): string | null {
  const match = path.match(/^\/chat\/([^/]+)$/);

  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function createOptimisticMessage(role: 'user' | 'assistant', text: string): ThreadMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role,
    text,
    createdAt: new Date().toISOString(),
  };
}

function deriveInitials(name: string | null, email: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  if (email) {
    return email.slice(0, 2).toUpperCase();
  }

  return '??';
}

export function App() {
  const route = useRoute();
  const activeProjectId = getChatProjectId(route.path);
  const { preference: themePreference, cycle: cycleTheme } = useTheme();
  const { status: connectionStatus, reportFailure, reportSuccess } = useConnectionStatus();
  const mobileNav = useMobileNav();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [projectName, setProjectName] = useState('Demo Project');
  const [projectId, setProjectId] = useState('');
  const [adminMessage, setAdminMessage] = useState('hello');
  const [meResult, setMeResult] = useState('');
  const [meName, setMeName] = useState<string | null>(null);
  const [mindspaceResult, setMindspaceResult] = useState('');
  const [adminResult, setAdminResult] = useState('');
  const [loadingOps, setLoadingOps] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Map<string, string>>(() => new Map());
  const errorTimeoutsRef = useRef<Map<string, number>>(new Map());

  // Dev-only test-credentials sign-in. Pre-fill from Vite env vars so the
  // buttons can authenticate against a deployed worker via the dev-server proxy
  // without a Google account. The whole panel is conditionally rendered on
  // `import.meta.env.DEV`, so production builds never contain it.
  const [testEmail, setTestEmail] = useState(
    (import.meta.env.VITE_FIREBASE_TEST_EMAIL as string | undefined) ?? '',
  );
  const [testPassword, setTestPassword] = useState(
    (import.meta.env.VITE_FIREBASE_TEST_PASSWORD as string | undefined) ?? '',
  );

  const [projects, setProjects] = useState<AccessibleProjectSummary[]>([]);
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [feedPosts, setFeedPosts] = useState<ChannelFeedPost[]>([]);
  const [newPostMessage, setNewPostMessage] = useState('');
  const [pendingSeedThread, setPendingSeedThread] = useState<{ threadId: string; channelId: string } | null>(null);
  const [pendingThreadSelection, setPendingThreadSelection] = useState<{
    threadId: string;
    channelId: string;
    messageId?: string;
  } | null>(null);
  const [selectedThread, setSelectedThread] = useState<ThreadSummary | null>(null);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [pendingScrollMessageId, setPendingScrollMessageId] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [streamingReply, setStreamingReply] = useState('');
  const [interruptedNotice, setInterruptedNotice] = useState<string | undefined>(undefined);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('channel');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [streamingMinds, setStreamingMinds] = useState<Record<string, string>>({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsGeneral, setSettingsGeneral] = useState<ProjectSettingsGeneral | null>(null);
  const [settingsMembers, setSettingsMembers] = useState<ProjectSettingsMembers | null>(null);
  const [settingsMinds, setSettingsMinds] = useState<ProjectSettingsMinds | null>(null);
  const searchRequestIdRef = useRef(0);

  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId) ?? null,
    [channels, selectedChannelId],
  );

  function startLoading(op: string) {
    setLoadingOps((current) => new Set(current).add(op));
  }

  function stopLoading(op: string) {
    setLoadingOps((current) => {
      const next = new Set(current);
      next.delete(op);
      return next;
    });
  }

  function isLoadingOp(op: string) {
    return loadingOps.has(op);
  }

  function setError(scope: string, message: string) {
    const existingTimeout = errorTimeoutsRef.current.get(scope);
    if (existingTimeout) {
      window.clearTimeout(existingTimeout);
    }

    setErrors((current) => new Map(current).set(scope, message));

    const timeoutId = window.setTimeout(() => {
      setErrors((current) => {
        const next = new Map(current);
        next.delete(scope);
        return next;
      });
      errorTimeoutsRef.current.delete(scope);
    }, 8000);

    errorTimeoutsRef.current.set(scope, timeoutId);
  }

  function clearError(scope: string) {
    const existingTimeout = errorTimeoutsRef.current.get(scope);
    if (existingTimeout) {
      window.clearTimeout(existingTimeout);
      errorTimeoutsRef.current.delete(scope);
    }

    setErrors((current) => {
      const next = new Map(current);
      next.delete(scope);
      return next;
    });
  }

  function reportScopedError(scope: string, error: unknown) {
    reportFailure();
    setError(scope, humanizeError(error));
  }

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser as AuthUser | null);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setMeResult('');
      setMeName(null);
      setProjects([]);
      setChannels([]);
      setFeedPosts([]);
      setSelectedThread(null);
      setThreadMessages([]);
      return;
    }

    void handleGetMe();
    void handleLoadProjects();
  }, [user]);

  useEffect(() => {
    return () => {
      for (const timeoutId of errorTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      errorTimeoutsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    setProjectId(activeProjectId ?? '');
    setSelectedThread(null);
    setThreadMessages([]);
    setStreamingReply('');
    setPendingScrollMessageId(null);
    setInterruptedNotice(undefined);
    setPendingThreadSelection(null);
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
    setStreamingMinds({});
    setSettingsGeneral(null);
    setSettingsMembers(null);
    setSettingsMinds(null);
    searchRequestIdRef.current += 1;
    mobileNav.resetStack();
  }, [activeProjectId]);

  useEffect(() => {
    if (!user || !activeProjectId) {
      return;
    }

    void handleLoadChannels(activeProjectId);
  }, [user, activeProjectId]);

  useEffect(() => {
    if (!user || !activeProjectId || !selectedChannelId) {
      return;
    }

    setSelectedThread(null);
    setThreadMessages([]);
    setStreamingReply('');
    setPendingScrollMessageId(null);
    setInterruptedNotice(undefined);
    setPendingThreadSelection(null);
    setSearchResults([]);
    setSearchQuery('');
    setIsSearchOpen(false);
    setStreamingMinds({});
    searchRequestIdRef.current += 1;
    mobileNav.resetStack();
    void handleLoadFeed(activeProjectId, selectedChannelId);
  }, [user, activeProjectId, selectedChannelId]);

  useEffect(() => {
    if (!isSearchOpen || !user || !activeProjectId) {
      return;
    }

    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const requestId = ++searchRequestIdRef.current;
    const timeoutId = window.setTimeout(() => {
      setIsSearching(true);
      void searchMessages(
        user,
        activeProjectId,
        trimmedQuery,
        searchScope === 'channel' && selectedChannelId ? { channelId: selectedChannelId } : undefined,
      )
        .then((result) => {
          if (searchRequestIdRef.current !== requestId) {
            return;
          }
          setSearchResults(result.results);
        })
        .catch((error) => {
          if (searchRequestIdRef.current !== requestId) {
            return;
          }
          setError('feed', String(error));
          setSearchResults([]);
        })
        .finally(() => {
          if (searchRequestIdRef.current === requestId) {
            setIsSearching(false);
          }
        });
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isSearchOpen, user, activeProjectId, searchQuery, searchScope, selectedChannelId]);

  useEffect(() => {
    if (!user || !activeProjectId || !pendingSeedThread || selectedChannelId !== pendingSeedThread.channelId) {
      return;
    }

    void handleOpenThread(pendingSeedThread.threadId).then(() => {
      void runThreadStream({
        threadId: pendingSeedThread.threadId,
        channelId: pendingSeedThread.channelId,
        agentId: 'librarian',
      }).catch((error) => {
        setError('thread', humanizeError(error));
      });
      setPendingSeedThread(null);
    });
  }, [user, activeProjectId, selectedChannelId, pendingSeedThread]);

  useEffect(() => {
    if (!user || !activeProjectId || !pendingThreadSelection || selectedChannelId !== pendingThreadSelection.channelId) {
      return;
    }

    void handleOpenThread(pendingThreadSelection.threadId, pendingThreadSelection.channelId).then(() => {
      if (pendingThreadSelection.messageId) {
        setPendingScrollMessageId(pendingThreadSelection.messageId);
      }
      setPendingThreadSelection(null);
    });
  }, [user, activeProjectId, selectedChannelId, pendingThreadSelection]);

  useEffect(() => {
    if (!pendingScrollMessageId) {
      return;
    }

    const target = document.querySelector<HTMLElement>(`[data-message-id="${pendingScrollMessageId}"]`);
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setPendingScrollMessageId(null);
  }, [pendingScrollMessageId, threadMessages]);

  useChannelEvents({
    user,
    projectId: activeProjectId,
    channelId: selectedChannelId || null,
    handlers: useMemo(
      () => ({
        new_thread: (data) => {
          setFeedPosts((current) => [
            {
              threadId: data.thread.id,
              rootMessageId: data.rootMessage.id,
              rootMessageText: data.rootMessage.text,
              rootMessageRole: data.rootMessage.role,
              replyCount: 0,
              lastMessageAt: data.thread.lastMessageAt,
              createdAt: data.rootMessage.createdAt,
            },
            ...current.filter((post) => post.threadId !== data.thread.id),
          ]);
        },
        new_message: (data) => {
          if (selectedThread?.id !== data.threadId) {
            return;
          }

          setThreadMessages((current) =>
            current.some((message) => message.id === data.message.id) ? current : [...current, data.message],
          );
        },
        thread_updated: (data) => {
          setFeedPosts((current) =>
            current.map((post) =>
              post.threadId === data.threadId
                ? {
                    ...post,
                    lastMessageAt: data.lastMessageAt,
                    replyCount: data.replyCount,
                  }
                : post,
            ),
          );
          setSelectedThread((current) =>
            current && current.id === data.threadId
              ? {
                  ...current,
                  lastMessageAt: data.lastMessageAt,
                  updatedAt: data.lastMessageAt,
                }
              : current,
          );
        },
        mind_streaming: (data) => {
          setStreamingMinds((current) => {
            const next = { ...current };
            if (data.status === 'started') {
              next[data.threadId] = data.mindName;
            } else {
              delete next[data.threadId];
            }
            return next;
          });
        },
      }),
      [selectedThread?.id],
    ),
  });

  async function handleTestSignIn() {
    startLoading('test-sign-in');
    clearError('admin');
    try {
      await signInWithEmailPassword(testEmail, testPassword);
    } catch (error) {
      setError('admin', String(error));
    } finally {
      stopLoading('test-sign-in');
    }
  }

  async function handleSignInWithGoogle() {
    startLoading('sign-in');
    clearError('auth');
    try {
      await signInWithGoogle();
    } catch (error) {
      setError('auth', String(error));
    } finally {
      stopLoading('sign-in');
    }
  }

  async function handleGetMe() {
    if (!user) {
      return;
    }

    startLoading('me');
    clearError('admin');
    try {
      const result = await getMe(user);
      setMeName(result.name ?? null);
      setMeResult(JSON.stringify(result, null, 2));
      reportSuccess();
    } catch (error) {
      reportScopedError('admin', error);
    } finally {
      stopLoading('me');
    }
  }

  async function handleLoadProjects() {
    if (!user) {
      return;
    }

    startLoading('projects');
    clearError('admin');
    try {
      const result = await listAccessibleProjects(user);
      setProjects((current) => mergeProjects(current, result.projects));
      reportSuccess();
    } catch (error) {
      reportScopedError('admin', error);
    } finally {
      stopLoading('projects');
    }
  }

  async function loadSettings(projectId: string) {
    if (!user) {
      return;
    }

    startLoading('settings');
    clearError('settings');
    try {
      const [general, members, minds] = await Promise.all([
        getProjectSettingsGeneral(user, projectId),
        listProjectSettingsMembers(user, projectId),
        listProjectMindConfigs(user, projectId),
      ]);
      setSettingsGeneral(general);
      setSettingsMembers(members);
      setSettingsMinds(minds);
      reportSuccess();
    } catch (error) {
      reportScopedError('settings', error);
    } finally {
      stopLoading('settings');
    }
  }

  async function handleBootstrapProject() {
    if (!user) {
      return;
    }

    startLoading('bootstrap');
    clearError('admin');
    try {
      const result = await bootstrapProject(user, projectName);
      const bootstrappedProject = result.project;
      setProjectId(result.projectId);
      setMindspaceResult(JSON.stringify(result, null, 2));
      if (result.seedThread) {
        setPendingSeedThread(result.seedThread);
      }
      if (bootstrappedProject) {
        setProjects((current) => mergeProjects(current, [bootstrappedProject]));
      }
      reportSuccess();
    } catch (error) {
      reportScopedError('admin', error);
    } finally {
      stopLoading('bootstrap');
    }
  }

  async function handleRunAdminTest() {
    if (!user || !projectId) {
      return;
    }

    startLoading('admin-test');
    clearError('admin');
    try {
      const result = await runAdminTest(user, projectId, adminMessage);
      setAdminResult(JSON.stringify(result, null, 2));
      reportSuccess();
    } catch (error) {
      reportScopedError('admin', error);
    } finally {
      stopLoading('admin-test');
    }
  }

  async function handleLoadChannels(nextProjectId: string) {
    if (!user) {
      return;
    }

    startLoading('channels');
    clearError('channels');
    try {
      const result = await listProjectChannels(user, nextProjectId);
      setChannels(result.channels);
      setSelectedChannelId((current) => {
        if (current && result.channels.some((channel) => channel.id === current)) {
          return current;
        }

        return result.channels[0]?.id ?? '';
      });
      reportSuccess();
    } catch (error) {
      reportScopedError('channels', error);
    } finally {
      stopLoading('channels');
    }
  }

  async function handleCreateChannel(name: string) {
    if (!user || !activeProjectId || !name.trim()) {
      return;
    }

    startLoading('create-channel');
    clearError('channels');
    try {
      const result = await createProjectChannel(user, activeProjectId, name.trim());
      setChannels((current) =>
        [...current, result.channel].sort((left, right) => left.name.localeCompare(right.name)),
      );
      setSelectedChannelId(result.channel.id);
      setFeedPosts([]);
      if (result.seedThread) {
        const threadResult = await getChannelThread(
          user,
          activeProjectId,
          result.channel.id,
          result.seedThread.threadId,
        );
        setSelectedThread(threadResult.thread);
        setThreadMessages(threadResult.messages);
        setStreamingReply('');
        await runThreadStream({
          threadId: result.seedThread.threadId,
          channelId: result.channel.id,
          agentId: 'librarian',
        });
      } else {
        setSelectedThread(null);
        setThreadMessages([]);
        setStreamingReply('');
      }
      reportSuccess();
    } catch (error) {
      reportScopedError('channels', error);
    } finally {
      stopLoading('create-channel');
    }
  }

  async function handleLoadFeed(nextProjectId: string, channelId: string) {
    if (!user) {
      return;
    }

    startLoading('feed');
    clearError('feed');
    try {
      const result = await listChannelFeed(user, nextProjectId, channelId);
      setFeedPosts(result.posts);
      reportSuccess();
    } catch (error) {
      reportScopedError('feed', error);
    } finally {
      stopLoading('feed');
    }
  }

  async function handleOpenThread(threadId: string, channelIdOverride?: string) {
    if (!user || !activeProjectId) {
      return;
    }

    const channelId = channelIdOverride ?? selectedChannelId;
    if (!channelId) {
      return;
    }

    startLoading('thread');
    clearError('thread');
    try {
      const result = await getChannelThread(user, activeProjectId, channelId, threadId);
      setSelectedThread(result.thread);
      setThreadMessages(result.messages);
      setStreamingReply('');
      setInterruptedNotice(undefined);
      reportSuccess();
    } catch (error) {
      reportScopedError('thread', error);
    } finally {
      stopLoading('thread');
    }
  }

  async function handleCreatePost() {
    if (!user || !activeProjectId || !selectedChannelId) {
      return;
    }

    const message = newPostMessage.trim();

    if (!message) {
      return;
    }

    startLoading('create-post');
    clearError('feed');
    try {
      const result = await createChannelPost(user, activeProjectId, selectedChannelId, message);
      setFeedPosts((current) => [
        {
          threadId: result.thread.id,
          rootMessageId: result.rootMessage.id,
          rootMessageText: result.rootMessage.text,
          rootMessageRole: result.rootMessage.role,
          replyCount: 0,
          lastMessageAt: result.thread.lastMessageAt,
          createdAt: result.rootMessage.createdAt,
        },
        ...current.filter((post) => post.threadId !== result.thread.id),
      ]);
      setNewPostMessage('');
      await handleOpenThread(result.thread.id);
      await runThreadStream({
        threadId: result.thread.id,
        channelId: selectedChannelId,
      });
      reportSuccess();
    } catch (error) {
      setError('feed', humanizeError(error));
    } finally {
      stopLoading('create-post');
    }
  }

  async function runThreadStream(input: {
    threadId: string;
    channelId: string;
    message?: string;
    agentId?: string;
  }) {
    if (!user || !activeProjectId) {
      return;
    }

    try {
      await streamThreadReply(
        user,
        activeProjectId,
        input.channelId,
        input.threadId,
        input.message,
        {
          onEvent: (event) => {
            if (event.event === 'token') {
              setStreamingReply((current) => `${current}${String(event.data.text ?? '')}`);
            }

            if (event.event === 'message_saved') {
              setThreadMessages((current) => [
                ...current,
                {
                  id: String(event.data.id ?? `assistant-${Date.now()}`),
                  role: String(event.data.role ?? 'assistant'),
                  text: String(event.data.text ?? ''),
                  createdAt: String(event.data.createdAt ?? new Date().toISOString()),
                },
              ]);
              setStreamingReply('');
            }

            if (event.event === 'thread_updated') {
              const nextLastMessageAt =
                typeof event.data.lastMessageAt === 'string' ? event.data.lastMessageAt : null;

              if (nextLastMessageAt) {
                setFeedPosts((current) =>
                  current.map((post) =>
                    post.threadId === input.threadId
                      ? {
                          ...post,
                          lastMessageAt: nextLastMessageAt,
                          replyCount: post.replyCount + 1,
                        }
                      : post,
                  ),
                );
                setSelectedThread((current) =>
                  current && current.id === input.threadId
                    ? {
                        ...current,
                        lastMessageAt: nextLastMessageAt,
                        updatedAt: nextLastMessageAt,
                      }
                    : current,
                );
              }
            }

            if (event.event === 'done') {
              setStreamingReply('');
              setInterruptedNotice(undefined);
            }
          },
        },
        input.agentId,
      );
      reportSuccess();
    } catch (error) {
      reportFailure();
      if (error instanceof StreamInterruptedError) {
        setInterruptedNotice('The reply was interrupted before completion.');
        setStreamingReply(error.partialText);
      }
      throw error;
    }
  }

  async function handleReplyInThread() {
    if (!user || !activeProjectId || !selectedChannelId || !selectedThread) {
      return;
    }

    const message = replyMessage.trim();

    if (!message) {
      return;
    }

    startLoading('reply');
    clearError('thread');
    const optimisticMessage = {
      ...createOptimisticMessage('user', message),
      retryText: message,
    };
    setThreadMessages((current) => [...current, optimisticMessage]);
    setReplyMessage('');
    setStreamingReply('');
    setInterruptedNotice(undefined);

    try {
      await runThreadStream({
        threadId: selectedThread.id,
        channelId: selectedChannelId,
        message,
      });
      reportSuccess();
    } catch (error) {
      setThreadMessages((current) =>
        current.map((entry) =>
          entry.id === optimisticMessage.id
            ? {
                ...entry,
                sendFailed: true,
                retryText: message,
              }
            : entry,
        ),
      );
      setError('thread', humanizeError(error));
    } finally {
      stopLoading('reply');
    }
  }

  const userDisplayName = meName ?? user?.email ?? 'Unknown User';
  const userInitials = deriveInitials(meName, user?.email ?? null);

  async function handleSelectSearchResult(result: SearchResult) {
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);

    if (result.channelId !== selectedChannelId) {
      setPendingThreadSelection({
        threadId: result.threadId,
        channelId: result.channelId,
        messageId: result.messageId,
      });
      setSelectedChannelId(result.channelId);
      return;
    }

    setPendingScrollMessageId(result.messageId);
    await handleOpenThread(result.threadId, result.channelId);
  }

  async function handleRetryFailedMessage(messageId: string) {
    const failedMessage = threadMessages.find((entry) => entry.id === messageId);
    if (!failedMessage?.retryText || !selectedThread || !selectedChannelId) {
      return;
    }

    setThreadMessages((current) =>
      current.map((entry) =>
        entry.id === messageId
          ? {
              ...entry,
              sendFailed: false,
            }
          : entry,
      ),
    );

    startLoading('reply');
    clearError('thread');
    setInterruptedNotice(undefined);

    try {
      await runThreadStream({
        threadId: selectedThread.id,
        channelId: selectedChannelId,
        message: failedMessage.retryText,
      });
    } catch (error) {
      setThreadMessages((current) =>
        current.map((entry) =>
          entry.id === messageId
            ? {
                ...entry,
                sendFailed: true,
              }
            : entry,
        ),
      );
      setError('thread', humanizeError(error));
    } finally {
      stopLoading('reply');
    }
  }

  function handleDiscardFailedMessage(messageId: string) {
    setThreadMessages((current) => current.filter((entry) => entry.id !== messageId));
  }

  async function handleSaveProjectSettings(name: string) {
    if (!user || !activeProjectId) {
      return;
    }

    startLoading('settings-save');
    clearError('settings');
    try {
      const result = await updateProjectSettingsGeneral(user, activeProjectId, { name });
      setSettingsGeneral((current) =>
        current
          ? {
              ...current,
              project: {
                ...current.project,
                name: result.project.name,
                slug: result.project.slug,
                status: result.project.status,
              },
            }
          : current,
      );
      setProjects((current) =>
        current.map((project) =>
          project.id === activeProjectId
            ? {
                ...project,
                name: result.project.name,
                slug: result.project.slug,
                status: result.project.status,
              }
            : project,
        ),
      );
      reportSuccess();
    } catch (error) {
      reportScopedError('settings', error);
    } finally {
      stopLoading('settings-save');
    }
  }

  async function handleArchiveProjectSettings() {
    if (!user || !activeProjectId) {
      return;
    }

    startLoading('settings-archive');
    clearError('settings');
    try {
      const result = await archiveProjectSettings(user, activeProjectId);
      setSettingsGeneral((current) =>
        current
          ? {
              ...current,
              project: {
                ...current.project,
                status: result.project.status,
              },
            }
          : current,
      );
      setProjects((current) =>
        current.map((project) =>
          project.id === activeProjectId
            ? {
                ...project,
                status: result.project.status,
              }
            : project,
        ),
      );
      reportSuccess();
    } catch (error) {
      reportScopedError('settings', error);
    } finally {
      stopLoading('settings-archive');
    }
  }

  async function handleInviteProjectMember(email: string, role: string) {
    if (!user || !activeProjectId) {
      return;
    }

    startLoading('settings-invite');
    clearError('settings');
    try {
      await inviteProjectMember(user, activeProjectId, { email, role });
      const members = await listProjectSettingsMembers(user, activeProjectId);
      setSettingsMembers(members);
      reportSuccess();
    } catch (error) {
      reportScopedError('settings', error);
    } finally {
      stopLoading('settings-invite');
    }
  }

  async function handleRemoveProjectMember(membershipId: string) {
    if (!user || !activeProjectId) {
      return;
    }

    startLoading('settings-remove-member');
    clearError('settings');
    try {
      await removeProjectMember(user, activeProjectId, membershipId);
      const members = await listProjectSettingsMembers(user, activeProjectId);
      setSettingsMembers(members);
      reportSuccess();
    } catch (error) {
      reportScopedError('settings', error);
    } finally {
      stopLoading('settings-remove-member');
    }
  }

  async function handleUpdateProjectMind(
    mindId: string,
    input: {
      displayName?: string;
      icon?: string;
      blurb?: string | null;
      enabled?: boolean;
      promptOverride?: string | null;
    },
  ) {
    if (!user || !activeProjectId) {
      return;
    }

    startLoading('settings-update-mind');
    clearError('settings');
    try {
      const result = await updateProjectMindConfig(user, activeProjectId, mindId, input);
      setSettingsMinds((current) =>
        current && result.mind
          ? {
              ...current,
              minds: current.minds.map((mind) => (mind.id === mindId ? result.mind! : mind)),
            }
          : current,
      );
      reportSuccess();
    } catch (error) {
      reportScopedError('settings', error);
    } finally {
      stopLoading('settings-update-mind');
    }
  }

  return (
    <>
      <Route path="/chat/:projectId">
        <main className={cn('mindspace-shell', selectedThread && 'thread-open')}>
          {mobileNav.isMobile ? (
            <MobileTopBar
              screen={selectedThread ? 'thread' : 'index'}
              channelName={selectedChannel?.name ?? 'channel'}
              onOpenSidebar={mobileNav.openSidebar}
              onBack={() => {
                mobileNav.popScreen();
                setSelectedThread(null);
                setThreadMessages([]);
                setStreamingReply('');
                setInterruptedNotice(undefined);
              }}
              onCloseThread={() => {
                setSelectedThread(null);
                setThreadMessages([]);
                setStreamingReply('');
                setInterruptedNotice(undefined);
              }}
              onOpenSearch={() => {
                setIsSearchOpen(true);
                setSearchQuery('');
                setSearchResults([]);
              }}
            />
          ) : null}
          <ConnectionBanner
            status={connectionStatus}
            onRetry={() => {
              reportSuccess();
            }}
          />
          {mobileNav.isMobile ? (
            <button
              type="button"
              className={cn('mobile-sidebar-backdrop', mobileNav.isSidebarOpen && 'mobile-sidebar-backdrop-open')}
              onClick={mobileNav.closeSidebar}
              aria-label="Close navigation"
            />
          ) : null}
          <div className={cn('mobile-sidebar-shell', mobileNav.isSidebarOpen && 'mobile-sidebar-shell-open')}>
            <Sidebar
              projects={projects}
              activeProjectId={activeProjectId ?? ''}
              isAdmin={false}
              channels={channels}
              selectedChannelId={selectedChannelId}
              isCreatingChannel={isLoadingOp('create-channel')}
              channelError={errors.get('channels')}
              minds={STUB_MINDS}
              teammates={STUB_TEAMMATES}
              userName={userDisplayName}
              userInitials={userInitials}
              theme={themePreference}
              onNavigateProject={(projectId) => navigate(`/chat/${projectId}`)}
              onOpenSettings={() => {
                setIsSettingsOpen(true);
                if (activeProjectId) {
                  void loadSettings(activeProjectId);
                }
              }}
              onSelectChannel={(channelId) => {
                setSelectedChannelId(channelId);
                mobileNav.closeSidebar();
              }}
              onCreateChannel={(name) => void handleCreateChannel(name)}
              onSignOut={() => void signOutUser()}
              onToggleTheme={cycleTheme}
            />
          </div>

          <div className={cn('mobile-feed-shell', mobileNav.isMobile && selectedThread && 'mobile-pane-hidden')}>
            <ChannelFeed
              selectedChannel={selectedChannel}
              feedPosts={feedPosts}
              selectedThreadId={selectedThread?.id ?? null}
              streamingMinds={streamingMinds}
              newPostMessage={newPostMessage}
              isFeedLoading={isLoadingOp('feed')}
              isCreatingPost={isLoadingOp('create-post')}
              feedError={errors.get('feed')}
              onOpenThread={(threadId) => {
                if (mobileNav.isMobile) {
                  mobileNav.pushThread();
                }
                void handleOpenThread(threadId);
              }}
              onChangeNewPostMessage={setNewPostMessage}
              onCreatePost={() => void handleCreatePost()}
              onComposerKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void handleCreatePost();
                }
              }}
              onRefreshFeed={() => {
                if (activeProjectId && selectedChannelId) {
                  void handleLoadFeed(activeProjectId, selectedChannelId);
                }
              }}
              isSearchOpen={isSearchOpen}
              searchQuery={searchQuery}
              searchScope={searchScope}
              searchResults={searchResults}
              isSearching={isSearching}
              onOpenSearch={() => {
                searchRequestIdRef.current += 1;
                setIsSearchOpen(true);
                setSearchQuery('');
                setSearchResults([]);
              }}
              onCloseSearch={() => {
                searchRequestIdRef.current += 1;
                setIsSearchOpen(false);
                setSearchQuery('');
                setSearchResults([]);
                setIsSearching(false);
              }}
              onChangeSearchQuery={setSearchQuery}
              onChangeSearchScope={(scope) => {
                searchRequestIdRef.current += 1;
                setSearchScope(scope);
                setSearchResults([]);
              }}
              onSelectSearchResult={(result) => {
                if (mobileNav.isMobile) {
                  mobileNav.pushThread();
                }
                void handleSelectSearchResult(result);
              }}
            />
          </div>

          <div className={cn('mobile-thread-shell', mobileNav.isMobile && !selectedThread && 'mobile-pane-hidden')}>
            <ThreadDrawer
              selectedThread={selectedThread}
              channelName={selectedChannel?.name ?? 'channel'}
              threadMessages={threadMessages}
              streamingReply={streamingReply}
              replyMessage={replyMessage}
              isThreadLoading={isLoadingOp('thread')}
              isReplying={isLoadingOp('reply')}
              currentUserName={userDisplayName}
              minds={STUB_MINDS.map((mind) => ({ name: mind.name, emoji: mind.icon }))}
              threadError={errors.get('thread')}
              interruptedNotice={interruptedNotice}
              onClose={() => {
                setSelectedThread(null);
                setThreadMessages([]);
                setStreamingReply('');
                setInterruptedNotice(undefined);
                mobileNav.popScreen();
              }}
              onChangeReplyMessage={setReplyMessage}
              onReply={() => void handleReplyInThread()}
              onReplyKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void handleReplyInThread();
                }
              }}
              onRetryFailedMessage={(messageId) => void handleRetryFailedMessage(messageId)}
              onDiscardFailedMessage={handleDiscardFailedMessage}
            />
          </div>
          <SettingsModal
            open={isSettingsOpen}
            general={settingsGeneral}
            members={settingsMembers}
            minds={settingsMinds}
            isLoading={isLoadingOp('settings')}
            error={errors.get('settings')}
            onClose={() => setIsSettingsOpen(false)}
            onRefresh={() => {
              if (activeProjectId) {
                void loadSettings(activeProjectId);
              }
            }}
            onSaveGeneral={(name) => void handleSaveProjectSettings(name)}
            onArchiveProject={() => void handleArchiveProjectSettings()}
            onInviteMember={(email, role) => void handleInviteProjectMember(email, role)}
            onRemoveMember={(membershipId) => void handleRemoveProjectMember(membershipId)}
            onUpdateMind={(mindId, input) => void handleUpdateProjectMind(mindId, input)}
          />
        </main>
      </Route>

      {import.meta.env.DEV ? (
        <Route path="/admin/test">
          <AdminConsole
            user={user}
            projects={projects}
            projectName={projectName}
            projectId={projectId}
            adminMessage={adminMessage}
            meResult={meResult}
            mindspaceResult={mindspaceResult}
            adminResult={adminResult}
            errors={errors}
            testEmail={testEmail}
            testPassword={testPassword}
            isLoadingOp={isLoadingOp}
            onSetProjectName={setProjectName}
            onSetProjectId={setProjectId}
            onSetAdminMessage={setAdminMessage}
            onSetTestEmail={setTestEmail}
            onSetTestPassword={setTestPassword}
            onSignInWithGoogle={() => void handleSignInWithGoogle()}
            onSignOut={() => void signOutUser()}
            onTestSignIn={() => void handleTestSignIn()}
            onGetMe={() => void handleGetMe()}
            onBootstrapProject={() => void handleBootstrapProject()}
            onRunAdminTest={() => void handleRunAdminTest()}
          />
        </Route>
      ) : null}

      <Route path="/">
        {user ? (
          <PostAuthRouter
            projects={projects}
            isLoading={isLoadingOp('projects')}
            onSignOut={() => void signOutUser()}
          />
        ) : (
          <SignIn
            onSignInWithGoogle={() => void handleSignInWithGoogle()}
            isSigningIn={isLoadingOp('sign-in')}
            error={errors.get('auth')}
          />
        )}
      </Route>
    </>
  );
}
