# ABOUTME: Chrome DevTools-based verification plan for the frontend hardening work
# ABOUTME: Covers visual, functional, a11y, performance, responsive, and error-path testing via MCP tools

# Task 10 Testing: Frontend Hardening Verification Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Status**: Planning
**Created**: 2026-04-24
**Updated**: 2026-04-24
**Assigned**: Claude + Remy
**Priority**: High
**Estimated Effort**: 1-2 focused sessions
**Dependencies**: Task 10 (frontend hardening implementation plan) — run this plan after each phase or after all phases are complete.

**Goal:** Rigorously verify every change from the frontend hardening plan using Chrome DevTools MCP tools — visual screenshots, a11y tree snapshots, DOM assertions via `evaluate_script`, network request validation, Lighthouse audits, responsive viewport emulation, keyboard interaction testing, and performance tracing.

**Architecture:** Each verification task maps 1:1 to a phase from the implementation plan. Tests use the Chrome DevTools MCP tools exclusively (no manual browser interaction). Every test step specifies the exact tool call, expected result, and pass/fail criteria. The test runner (Claude) navigates the live app, interacts with it, and asserts on observable state.

**Tech Stack:** Chrome DevTools MCP (take_snapshot, take_screenshot, evaluate_script, click, fill, press_key, hover, emulate, resize_page, lighthouse_audit, performance_start_trace, list_console_messages, list_network_requests, wait_for)

---

## Prerequisites

Before running any verification:

### Step 1: Start the dev server

```bash
pnpm --filter @mastra-mindspace/web dev
```

Note the port (usually 5173 or 5174).

### Step 2: Navigate browser to the app

```
Tool: navigate_page
  url: http://localhost:<port>
  type: url
```

### Step 3: Authenticate

```
Tool: take_snapshot
  → Find the "Sign in with test credentials" button uid
Tool: click
  → uid: <sign-in-button-uid>
Tool: wait_for
  → text: ["test02@test.com"]  (in the Authenticated user field)
```

### Step 4: Bootstrap or select a project

If no projects exist:
```
Tool: take_snapshot
  → Find "Create Demo Project" button uid
Tool: click
  → uid: <create-button-uid>
Tool: wait_for
  → text: ["project"]  (in bootstrap response)
```

Then navigate to chat:
```
Tool: take_snapshot
  → Find "Open Chat Mindspace" button uid
Tool: click
  → uid: <open-chat-uid>
Tool: wait_for
  → text: ["Mindspaces"]  (sidebar heading)
```

### Step 5: Verify baseline — take a full-page screenshot for reference

```
Tool: take_screenshot
  fullPage: true
  filePath: /tmp/mindspace-test/00_baseline_chat.png
```

---

## Verification 1: Scroll Containment (Phase 1)

Verifies that sidebar, feed, and thread panels scroll independently within viewport height and that composers stay pinned at the bottom.

### Test 1.1: Page does not produce a body scrollbar

**Step 1: Check that body has no overflow**

```
Tool: evaluate_script
  function: () => {
    const body = document.body;
    const html = document.documentElement;
    return {
      bodyScrollHeight: body.scrollHeight,
      bodyClientHeight: body.clientHeight,
      htmlScrollHeight: html.scrollHeight,
      htmlClientHeight: html.clientHeight,
      bodyOverflows: body.scrollHeight > body.clientHeight,
      htmlOverflows: html.scrollHeight > html.clientHeight,
    };
  }
```

**Pass criteria:** `bodyOverflows === false` AND `htmlOverflows === false`. The viewport should contain all three columns without producing a page-level scrollbar.

### Test 1.2: Feed list container is scrollable

**Step 1: Measure the feed list container**

```
Tool: evaluate_script
  function: () => {
    const feedList = document.querySelector('.feed-list');
    if (!feedList) return { error: 'feed-list not found' };
    const style = getComputedStyle(feedList);
    return {
      overflowY: style.overflowY,
      height: feedList.clientHeight,
      scrollHeight: feedList.scrollHeight,
      minHeight: style.minHeight,
    };
  }
```

**Pass criteria:** `overflowY` is `auto` or `scroll`. `minHeight` is `0px` (required for grid scroll containment).

### Test 1.3: Thread messages container is scrollable

```
Tool: evaluate_script
  function: () => {
    const threadMessages = document.querySelector('.thread-messages');
    if (!threadMessages) return { error: 'thread-messages not found' };
    const style = getComputedStyle(threadMessages);
    return {
      overflowY: style.overflowY,
      minHeight: style.minHeight,
    };
  }
```

**Pass criteria:** `overflowY` is `auto` or `scroll`. `minHeight` is `0px`.

### Test 1.4: Sidebar is scrollable

```
Tool: evaluate_script
  function: () => {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return { error: 'sidebar not found' };
    const style = getComputedStyle(sidebar);
    return {
      overflowY: style.overflowY,
    };
  }
```

**Pass criteria:** `overflowY` is `auto` or `scroll`.

### Test 1.5: Mindspace shell uses fixed viewport height

```
Tool: evaluate_script
  function: () => {
    const shell = document.querySelector('.mindspace-shell');
    if (!shell) return { error: 'mindspace-shell not found' };
    return {
      height: shell.clientHeight,
      windowHeight: window.innerHeight,
      matches: shell.clientHeight === window.innerHeight,
    };
  }
```

**Pass criteria:** `matches === true` — the shell height equals the viewport height exactly.

### Test 1.6: Composer stays visible at bottom (visual)

**Step 1: Take a screenshot of the full viewport (NOT fullPage)**

```
Tool: take_screenshot
  filePath: /tmp/mindspace-test/01_scroll_containment_viewport.png
```

**Pass criteria (visual inspection):** The "Start a post" textarea and "Send to..." button are visible at the bottom of the center column without scrolling.

### Test 1.7: Thread reply box stays visible at bottom

**Prereq:** Open a thread first (click a feed post).

```
Tool: take_snapshot
  → Find a feed post button uid
Tool: click
  → uid: <feed-post-uid>
Tool: wait_for
  → text: ["Reply in thread"]
Tool: take_screenshot
  filePath: /tmp/mindspace-test/01_thread_reply_visible.png
```

**Pass criteria (visual inspection):** The "Reply in thread" textarea and button are visible at the bottom of the right column.

---

## Verification 2: Feed Card Interactivity (Phase 2)

### Test 2.1: Feed card shows hover state

**Step 1: Get the feed card button uid**

```
Tool: take_snapshot
  → Find the feed-card-button uid for a post
```

**Step 2: Hover over it**

```
Tool: hover
  uid: <feed-card-button-uid>
```

**Step 3: Check computed background**

```
Tool: evaluate_script
  function: (el) => {
    const style = getComputedStyle(el);
    return {
      backgroundColor: style.backgroundColor,
      cursor: style.cursor,
    };
  }
  args: ["<feed-card-button-uid>"]
```

**Pass criteria:** `backgroundColor` is not `transparent` or `rgba(0, 0, 0, 0)` (hover state applied). `cursor` is `pointer`.

**Step 4: Take a screenshot of the hovered card**

```
Tool: take_screenshot
  uid: <feed-card-button-uid>
  filePath: /tmp/mindspace-test/02_feed_card_hover.png
```

### Test 2.2: Feed card shows focus ring on keyboard focus

**Step 1: Press Tab to focus the feed card**

```
Tool: press_key
  key: Tab
```

(Repeat Tab presses until the feed card is focused — verify with snapshot)

**Step 2: Take a screenshot**

```
Tool: take_screenshot
  filePath: /tmp/mindspace-test/02_feed_card_focus.png
```

**Pass criteria (visual):** A visible ring/outline appears around the focused feed card.

**Step 3: Verify focus ring via computed style**

```
Tool: evaluate_script
  function: () => {
    const focused = document.activeElement;
    if (!focused || !focused.classList.contains('feed-card-button')) {
      return { error: 'feed-card-button not focused', activeElement: focused?.tagName };
    }
    const style = getComputedStyle(focused);
    return {
      boxShadow: style.boxShadow,
      outline: style.outline,
      outlineColor: style.outlineColor,
    };
  }
```

**Pass criteria:** Either `boxShadow` contains a ring value OR `outline` is not `none`.

### Test 2.3: Feed card shows active/selected state when thread is open

**Step 1: Click a feed post to open its thread**

```
Tool: take_snapshot
  → Find feed-card-button uid
Tool: click
  uid: <feed-card-button-uid>
  includeSnapshot: true
```

**Step 2: Check for active class**

```
Tool: evaluate_script
  function: () => {
    const activeCard = document.querySelector('.feed-card-active');
    return {
      exists: !!activeCard,
      text: activeCard?.textContent?.substring(0, 80),
    };
  }
```

**Pass criteria:** `exists === true`.

**Step 3: Screenshot the selected card**

```
Tool: take_screenshot
  filePath: /tmp/mindspace-test/02_feed_card_selected.png
```

**Pass criteria (visual):** The selected card has a distinct background and/or left border that differentiates it from unselected cards.

---

## Verification 3: Keyboard Submit (Phase 3)

### Test 3.1: Cmd+Enter submits a new post from the composer

**Step 1: Navigate to chat view with a channel selected**

```
Tool: take_snapshot
  → Find the composer textarea uid (aria-label "Start a post")
```

**Step 2: Type a message into the composer**

```
Tool: fill
  uid: <composer-textarea-uid>
  value: "Keyboard submit test post"
```

**Step 3: Clear network log to isolate the POST request**

```
Tool: navigate_page
  type: reload
```

Wait for page to load, re-authenticate if needed, navigate back to chat.

Alternative approach — just press the key and check the result:

**Step 3 (simpler): Press Meta+Enter**

```
Tool: click
  uid: <composer-textarea-uid>
Tool: press_key
  key: Meta+Enter
```

**Step 4: Wait for the post to appear**

```
Tool: wait_for
  text: ["Keyboard submit test post"]
  timeout: 10000
```

**Pass criteria:** The post text appears in the feed, confirming the form was submitted via keyboard shortcut.

**Step 5: Verify the API call was made**

```
Tool: list_network_requests
  resourceTypes: ["fetch"]
```

**Pass criteria:** A POST request to `/api/projects/<id>/channels/<id>/posts` appears in the network log.

### Test 3.2: Ctrl+Enter submits a thread reply

**Step 1: Open a thread**

```
Tool: take_snapshot
  → Find feed post button uid
Tool: click
  uid: <post-uid>
Tool: wait_for
  text: ["Reply in thread"]
```

**Step 2: Fill the reply textarea**

```
Tool: take_snapshot
  → Find the reply textarea uid (aria-label "Reply in thread")
Tool: fill
  uid: <reply-textarea-uid>
  value: "Ctrl+Enter reply test"
```

**Step 3: Press Ctrl+Enter**

```
Tool: click
  uid: <reply-textarea-uid>
Tool: press_key
  key: Control+Enter
```

**Step 4: Wait for the reply to appear (or streaming to begin)**

```
Tool: wait_for
  text: ["Ctrl+Enter reply test"]
  timeout: 10000
```

**Pass criteria:** The reply message appears in the thread messages area.

### Test 3.3: Plain Enter does NOT submit (allows newlines)

**Step 1: Focus the composer**

```
Tool: take_snapshot
  → Find composer textarea uid
Tool: click
  uid: <composer-textarea-uid>
```

**Step 2: Type text and press plain Enter**

```
Tool: fill
  uid: <composer-textarea-uid>
  value: "Should not submit"
Tool: press_key
  key: Enter
```

**Step 3: Verify no POST request was made**

```
Tool: list_network_requests
  resourceTypes: ["fetch"]
```

**Pass criteria:** No new POST request to `/posts` endpoint. The textarea should still contain the text (possibly with a newline added).

---

## Verification 4: Loading Feedback (Phase 4)

### Test 4.1: Spinner appears during feed loading

This test requires the feed to actually load from the API. If the backend is unavailable, skip this and verify via the unit test approach instead.

**Step 1: Navigate to a channel (or reload)**

```
Tool: navigate_page
  type: reload
```

**Step 2: Immediately take a snapshot to catch loading state**

```
Tool: take_snapshot
```

**Pass criteria:** Look for an element with `role="status"` and `aria-label="Loading"` in the a11y tree, OR text matching "Loading feed..."

**Alternative (if too fast to catch):** Use evaluate_script to throttle:

```
Tool: emulate
  networkConditions: "Slow 3G"
```

```
Tool: navigate_page
  type: reload
```

```
Tool: take_screenshot
  filePath: /tmp/mindspace-test/04_loading_spinner.png
```

**Pass criteria (visual):** A spinner is visible in the feed area or thread area.

Then disable throttling:

```
Tool: emulate
  networkConditions: null
```

### Test 4.2: Spinner component renders correctly

```
Tool: evaluate_script
  function: () => {
    const spinners = document.querySelectorAll('[role="status"][aria-label="Loading"]');
    return {
      count: spinners.length,
      details: Array.from(spinners).map(s => ({
        className: s.className,
        visible: s.offsetParent !== null,
      })),
    };
  }
```

**Pass criteria (during loading):** At least one spinner found with `visible: true`.

### Test 4.3: No console errors from loading state changes

```
Tool: list_console_messages
  types: ["error"]
```

**Pass criteria:** No error messages related to React state updates, unmounted components, or loading state.

---

## Verification 5: Error Handling (Phase 5)

### Test 5.1: Error displays with role="alert" on API failure

To trigger an error, attempt an action that will fail (e.g., post to a channel when the backend is down).

**Step 1: Stop the API proxy or use an invalid project**

If backend is unavailable, any API call should produce an error. Navigate to a fake project:

```
Tool: navigate_page
  url: http://localhost:<port>/chat/nonexistent-project-id
  type: url
```

**Step 2: Wait for error to appear**

```
Tool: wait_for
  text: ["Error", "error", "failed"]
  timeout: 10000
```

**Step 3: Check for role="alert" in the a11y tree**

```
Tool: take_snapshot
```

**Pass criteria:** An element with `role="alert"` exists in the snapshot, containing the error message text.

**Step 4: Screenshot the error display**

```
Tool: take_screenshot
  filePath: /tmp/mindspace-test/05_inline_error.png
```

**Pass criteria (visual):** The error appears inline near the action that triggered it (e.g., near the feed area), not in a generic status bar or debug section.

### Test 5.2: Error auto-dismisses after timeout

**Step 1: After triggering an error (from 5.1), wait 6 seconds**

```
Tool: evaluate_script
  function: () => {
    return new Promise(resolve => {
      setTimeout(() => {
        const alerts = document.querySelectorAll('[role="alert"]');
        resolve({
          alertCount: alerts.length,
          stillVisible: alerts.length > 0,
        });
      }, 6000);
    });
  }
```

**Pass criteria:** `alertCount === 0` — the error has auto-dismissed after 5 seconds.

### Test 5.3: No stale errors leaking across views

**Step 1: Trigger an error in the feed area**

**Step 2: Switch to a different channel**

```
Tool: take_snapshot
  → Find a different channel button uid
Tool: click
  uid: <other-channel-uid>
```

**Step 3: Check that the feed error is gone**

```
Tool: evaluate_script
  function: () => {
    const alerts = document.querySelectorAll('[role="alert"]');
    return {
      alertCount: alerts.length,
      alertTexts: Array.from(alerts).map(a => a.textContent),
    };
  }
```

**Pass criteria:** `alertCount === 0` or alerts are only for the new context, not the previous one.

---

## Verification 6: Thread Drawer Controls (Phase 6)

### Test 6.1: Close button appears when thread is open

**Step 1: Open a thread**

```
Tool: take_snapshot
  → Find feed post button uid
Tool: click
  uid: <post-uid>
Tool: wait_for
  text: ["Conversation"]
```

**Step 2: Check for close button in a11y tree**

```
Tool: take_snapshot
```

**Pass criteria:** An element with `aria-label` containing "Close thread" or similar exists in the snapshot.

### Test 6.2: Clicking close button dismisses the thread

**Step 1: Click the close button**

```
Tool: take_snapshot
  → Find the close button uid (aria-label "Close thread")
Tool: click
  uid: <close-button-uid>
```

**Step 2: Verify thread is dismissed**

```
Tool: take_snapshot
```

**Pass criteria:** The text "Select a post" or "Choose a feed post" reappears. Thread messages are no longer visible.

**Step 3: Screenshot the closed state**

```
Tool: take_screenshot
  filePath: /tmp/mindspace-test/06_thread_closed.png
```

### Test 6.3: Close button is NOT visible when no thread is selected

**Step 1: Verify no close button in initial state**

```
Tool: take_snapshot
```

**Pass criteria:** No element with aria-label "Close thread" exists in the snapshot when no thread is open.

### Test 6.4: Auto-scroll to bottom on new messages

**Step 1: Open a thread with messages**

**Step 2: Check scroll position after thread loads**

```
Tool: evaluate_script
  function: () => {
    const container = document.querySelector('.thread-messages');
    if (!container) return { error: 'not found' };
    return {
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
      isAtBottom: container.scrollTop + container.clientHeight >= container.scrollHeight - 5,
    };
  }
```

**Pass criteria:** `isAtBottom === true` — the thread is scrolled to the latest message.

---

## Verification 7: Component Extraction (Phase 7)

Component extraction is a structural refactor — it should produce zero visual or behavioral changes. These tests verify nothing regressed.

### Test 7.1: Regression — full user flow still works after extraction

This is a comprehensive end-to-end walkthrough of the entire app.

**Step 1: Start from admin console**

```
Tool: navigate_page
  url: http://localhost:<port>/admin/test
  type: url
```

**Step 2: Sign in**

```
Tool: take_snapshot
  → Find sign-in button
Tool: click
  uid: <sign-in-uid>
Tool: wait_for
  text: ["test02@test.com"]
```

**Step 3: Navigate to chat**

```
Tool: take_snapshot
  → Find "Open Chat Mindspace" or a project button
  → Click to enter chat view
Tool: wait_for
  text: ["Mindspaces"]
```

**Step 4: Verify sidebar renders**

```
Tool: take_snapshot
```

**Pass criteria:** Sidebar contains project buttons with names and slugs, channel list with `#` prefix, "Admin Console" and "Sign out" buttons.

**Step 5: Verify channel feed renders**

**Pass criteria:** Channel feed header shows `#<channel-name>`. Feed posts (if any) are visible as cards.

**Step 6: Click a feed post to open thread**

```
Tool: click
  uid: <post-uid>
Tool: wait_for
  text: ["Conversation"]
```

**Pass criteria:** Thread drawer shows "Conversation" heading, thread messages are visible, reply textarea is present.

**Step 7: Full screenshot comparison**

```
Tool: take_screenshot
  fullPage: true
  filePath: /tmp/mindspace-test/07_regression_full.png
```

**Pass criteria (visual):** Layout matches pre-extraction baseline screenshot from Step 5 of prerequisites. No missing elements, broken layout, or visual artifacts.

### Test 7.2: A11y tree structure is preserved

**Step 1: Take a verbose a11y snapshot**

```
Tool: take_snapshot
  verbose: true
  filePath: /tmp/mindspace-test/07_a11y_tree.txt
```

**Pass criteria:** The a11y tree should contain:
- `nav` with `aria-label="Projects"` (sidebar project list)
- `nav` with `aria-label="Channels"` (channel list)
- Buttons with project names
- Buttons with channel names prefixed by `#`
- Textareas with `aria-label="Start a post"` and `aria-label="Reply in thread"`
- Buttons for "Send to..." and "Reply in thread"

### Test 7.3: No new console errors after extraction

```
Tool: list_console_messages
  types: ["error", "warn"]
```

**Pass criteria:** No new errors or warnings introduced by the refactor. React warnings about missing keys, invalid props, or ref forwarding are regressions.

---

## Verification 8: Responsive Layout

### Test 8.1: Tablet breakpoint (1100px)

**Step 1: Resize to tablet**

```
Tool: resize_page
  width: 1100
  height: 800
```

**Step 2: Screenshot**

```
Tool: take_screenshot
  filePath: /tmp/mindspace-test/08_responsive_1100.png
```

**Step 3: Verify layout**

```
Tool: evaluate_script
  function: () => {
    const shell = document.querySelector('.mindspace-shell');
    if (!shell) return { error: 'not found' };
    const style = getComputedStyle(shell);
    const threadDrawer = document.querySelector('.thread-drawer');
    const drawerStyle = threadDrawer ? getComputedStyle(threadDrawer) : null;
    return {
      gridTemplateColumns: style.gridTemplateColumns,
      threadDrawerBorderTop: drawerStyle?.borderTopWidth,
      threadDrawerBorderLeft: drawerStyle?.borderLeftWidth,
    };
  }
```

**Pass criteria:** At 1100px, the grid should be 2 columns (sidebar + feed). Thread drawer should have a `border-top` and no `border-left` (stacked below).

### Test 8.2: Mobile breakpoint (768px)

**Step 1: Resize to mobile**

```
Tool: resize_page
  width: 375
  height: 812
```

**Step 2: Screenshot**

```
Tool: take_screenshot
  filePath: /tmp/mindspace-test/08_responsive_375.png
```

**Step 3: Verify single-column layout**

```
Tool: evaluate_script
  function: () => {
    const shell = document.querySelector('.mindspace-shell');
    if (!shell) return { error: 'not found' };
    const style = getComputedStyle(shell);
    return {
      gridTemplateColumns: style.gridTemplateColumns,
      height: style.height,
    };
  }
```

**Pass criteria:** `gridTemplateColumns` resolves to a single column value. `height` is `auto` (not `100vh`), allowing natural stacking scroll.

### Test 8.3: Mobile with touch emulation

```
Tool: emulate
  viewport: "375x812x2,mobile,touch"
```

```
Tool: take_screenshot
  filePath: /tmp/mindspace-test/08_responsive_mobile_touch.png
```

**Pass criteria (visual):** All interactive elements are large enough to tap (minimum 44x44px touch targets per WCAG).

### Test 8.4: Reset to desktop

```
Tool: resize_page
  width: 1440
  height: 900
```

```
Tool: emulate
  viewport: "1440x900x1"
```

---

## Verification 9: Accessibility Audit

### Test 9.1: Lighthouse a11y audit on chat view

**Step 1: Navigate to chat view**

```
Tool: navigate_page
  url: http://localhost:<port>/chat/<project-id>
  type: url
```

**Step 2: Run Lighthouse audit**

```
Tool: lighthouse_audit
  device: desktop
  mode: snapshot
  outputDirPath: /tmp/mindspace-test/lighthouse
```

**Pass criteria:**
- Accessibility score >= 90
- No critical a11y violations
- All interactive elements have accessible names
- Color contrast ratios pass WCAG AA

### Test 9.2: Lighthouse a11y audit on admin view

```
Tool: navigate_page
  url: http://localhost:<port>/admin/test
  type: url
Tool: lighthouse_audit
  device: desktop
  mode: snapshot
  outputDirPath: /tmp/mindspace-test/lighthouse-admin
```

**Pass criteria:** Accessibility score >= 85.

### Test 9.3: Mobile a11y audit

```
Tool: navigate_page
  url: http://localhost:<port>/chat/<project-id>
  type: url
Tool: lighthouse_audit
  device: mobile
  mode: snapshot
  outputDirPath: /tmp/mindspace-test/lighthouse-mobile
```

**Pass criteria:** Accessibility score >= 85. Touch target sizes pass.

---

## Verification 10: Performance Baseline

### Test 10.1: Page load performance trace

**Step 1: Navigate to chat view**

```
Tool: navigate_page
  url: http://localhost:<port>/chat/<project-id>
  type: url
```

**Step 2: Start a performance trace with reload**

```
Tool: performance_start_trace
  reload: true
  autoStop: true
  filePath: /tmp/mindspace-test/perf_trace.json.gz
```

**Step 3: Analyze results**

Review the performance insights returned. Look for:
- LCP (Largest Contentful Paint) — should be < 2.5s on localhost
- CLS (Cumulative Layout Shift) — should be < 0.1
- Any long tasks blocking the main thread

**Pass criteria:** No critical performance insights flagged. LCP < 2.5s. No layout shifts.

### Test 10.2: No excessive re-renders during interaction

**Step 1: Inject a render counter**

```
Tool: evaluate_script
  function: () => {
    window.__renderCount = 0;
    const origCreateElement = React.createElement;
    // This is approximate — just checking for excessive renders
    return { injected: true };
  }
```

Alternative — just check for console warnings about excessive renders:

```
Tool: list_console_messages
  types: ["warn"]
```

**Pass criteria:** No React "too many re-renders" warnings. No "Cannot update a component while rendering" errors.

### Test 10.3: No memory leaks from auth state listener

```
Tool: evaluate_script
  function: () => {
    // Check that event listeners are reasonable
    return {
      popstateListeners: getEventListeners ? getEventListeners(window).popstate?.length : 'N/A',
    };
  }
```

This is a basic sanity check. For deeper analysis:

```
Tool: take_memory_snapshot
  filePath: /tmp/mindspace-test/heap_baseline.heapsnapshot
```

**Pass criteria:** Heap snapshot is reasonable (< 50MB for a chat app on localhost). No obvious detached DOM nodes.

---

## Verification 11: Console Health

### Test 11.1: No console errors on initial load

**Step 1: Reload the page fresh**

```
Tool: navigate_page
  type: reload
  ignoreCache: true
```

**Step 2: Wait for load**

```
Tool: wait_for
  text: ["Mindspaces"]
  timeout: 10000
```

**Step 3: Check console**

```
Tool: list_console_messages
  types: ["error"]
```

**Pass criteria:** Zero error messages. Warnings about React strict mode or dev-only checks are acceptable but should be noted.

### Test 11.2: No console errors during full user flow

After performing the full regression test (Verification 7.1):

```
Tool: list_console_messages
  types: ["error"]
```

**Pass criteria:** Zero error messages accumulated during the entire interaction sequence.

### Test 11.3: No unhandled promise rejections

```
Tool: evaluate_script
  function: () => {
    return {
      unhandledRejections: window.__unhandledRejections ?? 'listener not set up',
    };
  }
```

To set up tracking at the start of testing:

```
Tool: evaluate_script
  function: () => {
    window.__unhandledRejections = [];
    window.addEventListener('unhandledrejection', (event) => {
      window.__unhandledRejections.push({
        reason: String(event.reason),
        timestamp: Date.now(),
      });
    });
    return { tracking: true };
  }
```

**Pass criteria:** `__unhandledRejections` array is empty after full test run.

---

## Verification 12: Network Request Validation

### Test 12.1: Auth token is sent on all API requests

**Step 1: Perform an action that triggers an API call (e.g., load feed)**

**Step 2: List fetch requests**

```
Tool: list_network_requests
  resourceTypes: ["fetch"]
```

**Step 3: Inspect a request**

```
Tool: get_network_request
  reqid: <api-request-id>
```

**Pass criteria:** The request includes an `Authorization: Bearer <token>` header. No API requests are made without auth.

### Test 12.2: No failed requests during normal flow

```
Tool: list_network_requests
  resourceTypes: ["fetch"]
```

**Pass criteria:** All API requests have 2xx status codes during normal authenticated usage. No 401, 403, or 500 responses.

### Test 12.3: API requests use correct endpoints

```
Tool: evaluate_script
  function: () => {
    return performance.getEntriesByType('resource')
      .filter(r => r.name.includes('/api/'))
      .map(r => ({ url: r.name, duration: r.duration }));
  }
```

**Pass criteria:** Endpoints match expected patterns:
- `GET /api/me`
- `GET /api/projects`
- `GET /api/projects/<id>/channels`
- `GET /api/projects/<id>/channels/<id>/feed`
- `GET /api/projects/<id>/channels/<id>/threads/<id>`
- `POST /api/projects/<id>/channels/<id>/posts`
- `POST /api/projects/<id>/channels/<id>/threads/<id>/messages/stream`

---

## Test Execution Checklist

Run verifications in this order, checking off as you go:

- [ ] **Prerequisites**: Dev server running, authenticated, project available
- [ ] **V1**: Scroll containment (Tests 1.1-1.7)
- [ ] **V2**: Feed card interactivity (Tests 2.1-2.3)
- [ ] **V3**: Keyboard submit (Tests 3.1-3.3)
- [ ] **V4**: Loading feedback (Tests 4.1-4.3)
- [ ] **V5**: Error handling (Tests 5.1-5.3)
- [ ] **V6**: Thread drawer controls (Tests 6.1-6.4)
- [ ] **V7**: Component extraction regression (Tests 7.1-7.3)
- [ ] **V8**: Responsive layout (Tests 8.1-8.4)
- [ ] **V9**: Accessibility audit (Tests 9.1-9.3)
- [ ] **V10**: Performance baseline (Tests 10.1-10.3)
- [ ] **V11**: Console health (Tests 11.1-11.3)
- [ ] **V12**: Network request validation (Tests 12.1-12.3)

## Results Template

After running all verifications, fill in this results summary:

```markdown
## Test Run Results — [DATE]

| Verification | Tests | Pass | Fail | Notes |
|-------------|-------|------|------|-------|
| V1 Scroll   | 7     |      |      |       |
| V2 Feed     | 3     |      |      |       |
| V3 Keyboard | 3     |      |      |       |
| V4 Loading  | 3     |      |      |       |
| V5 Error    | 3     |      |      |       |
| V6 Thread   | 4     |      |      |       |
| V7 Regress  | 3     |      |      |       |
| V8 Respond  | 4     |      |      |       |
| V9 A11y     | 3     |      |      |       |
| V10 Perf    | 3     |      |      |       |
| V11 Console | 3     |      |      |       |
| V12 Network | 3     |      |      |       |
| **Total**   | **42**|      |      |       |

Lighthouse Scores:
- Desktop Chat: a11y __/100
- Desktop Admin: a11y __/100
- Mobile Chat: a11y __/100

Screenshots saved to: /tmp/mindspace-test/
```
