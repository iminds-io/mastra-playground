# ABOUTME: Target frontend UI architecture for the Mastra Mindspace web app
# ABOUTME: Defines navigation, layout, components, and interaction design for a production-ready Slack-like experience

# Target Frontend UI Architecture Design

**Status:** Approved design — sections 1-8 locked
**Created:** 2026-04-24
**Updated:** 2026-04-24
**Authors:** Remy + Claude
**Audience:** Frontend engineers, designers, product stakeholders

---

## Executive Summary

This document defines the target UI architecture for the Mastra Mindspace web frontend — a team collaboration tool where 2-5 human collaborators work alongside multiple AI "minds" (named agent personas) in organized channels and threads.

The core design philosophy is **progressive disclosure**: show one project at a time, surface channels as primary navigation, and reveal thread detail only when a user engages. The UI draws from Slack's organizational metaphor but leans into a **forum-style thread model** that better suits AI-agent conversations — each channel is an index of topical threads, and all conversation happens within threads.

### Key design decisions

- **Project switcher** replaces the flat project list — one project active at a time
- **Channels are the hero** of the sidebar, not buried under project accordions
- **AI minds are named teammates** with personas, not anonymous "assistants"
- **Thread detail is earned space** — hidden by default, slides in when opened
- **Markdown rendering** is mandatory for AI message content
- **Settings live in a modal** behind a gear icon — minimal for v1, extensible via tabs
- **Google sign-in only** for v1 — clean single-button auth screen

---

## 1. User Model

### Primary user

A team of 2-5 collaborators using Mastra Mindspace as a shared AI-powered workspace. Most interactions involve posting a topic to a channel, having one or more AI minds respond, and discussing the results with teammates.

### Organizational hierarchy

```
Project (team boundary, defines membership)
  └── Mindspace (AI workspace, usually 1:1 with project, extensible to 1:many)
        └── Channels (topic organization within a mindspace)
              └── Threads (individual conversations, forum-style)
                    └── Messages (from humans and minds)
```

### Participant types

| Type | Identity | Avatar | Role |
|------|----------|--------|------|
| Human | Display name from Google account | 2-letter initials on colored circle | Team member, project owner |
| Mind | Configured name + emoji/icon (e.g., "Claude 🤖", "Reviewer 🔍") | Emoji/icon on accent-ringed circle | AI agent persona, configured per mindspace |

---

## 2. Navigation Architecture

Three-tier progressive disclosure model:

```
┌─────────────────────────────────────────────────────┐
│ Tier 1: Project Switcher (top of sidebar)           │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ▼ Acme Engineering          ⚙️                  │ │
│ │   acme-eng · 3 members                         │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ Tier 2: Mindspace + Channels (sidebar body)         │
│ ┌─────────────────────────────────────────────────┐ │
│ │ CHANNELS                                        │ │
│ │  # general                                ●     │ │
│ │  # engineering                            3     │ │
│ │  # design-review                                │ │
│ │  + Add channel                                  │ │
│ │                                                 │ │
│ │ MINDS                                           │ │
│ │  🤖 Claude                             ● on    │ │
│ │  🔍 Reviewer                           ● on    │ │
│ │                                                 │ │
│ │ TEAMMATES                                       │ │
│ │  AC Alice Chen                         ● on    │ │
│ │  BM Bob Martinez                       ⚫      │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ Tier 3: Thread list + Thread detail (main area)     │
│ ┌──────────────────────┬──────────────────────────┐ │
│ │ Thread index         │ Thread conversation      │ │
│ │ (channel feed)       │ (opened on click)        │ │
│ └──────────────────────┴──────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Project switcher

The project switcher sits at the top of the sidebar. It shows the active project name and slug. Clicking the dropdown arrow opens an overlay:

```
┌──────────────────────────────┐
│  ▼ Acme Engineering      ⚙️  │
│    acme-eng · 3 members      │
├──────────────────────────────┤
│                              │
│  🔍 Search projects...       │
│                              │
│  ACTIVE                      │
│  ● Acme Engineering       ✓  │
│    Q2 Roadmap                │
│    Personal Workspace        │
│                              │
│  ARCHIVED                    │
│    Auth Rewrite (done)       │
│                              │
│  + Create project            │
│                              │
└──────────────────────────────┘
```

- Shows one project at a time (solves the flat 48-project list problem)
- Search/filter built in
- Active vs archived grouping
- Gear icon `⚙️` opens settings modal

### Sidebar sections

| Section | Content | Interactions |
|---------|---------|-------------|
| **Channels** | Channel list with `#` prefix. Unread dot for activity, numeric badge for mentions. | Click to select channel, loads thread index. `+ Add channel` text link at bottom. |
| **Minds** | AI personas configured for this mindspace. Name + emoji + presence dot. | Click to view mind info (future: DM-style direct conversation). |
| **Teammates** | Human project members. Initials + name + presence. | Awareness only for v1. Future: DM. |
| **User footer** | Current user identity pinned at bottom. Sign out action. | Sign out link. |

### Sidebar collapse (medium screens, 768-1100px)

Sidebar collapses to a 48px icon rail:

```
┌────┐
│ AE │  ← project initials
│────│
│ #  │  ← channels icon
│ 🤖 │  ← minds icon
│ 👥 │  ← teammates icon
│    │
│────│
│ AC │  ← current user
└────┘
```

Hovering or clicking expands as a floating overlay. Gives thread index and detail maximum space.

---

## 3. Layout & Panel Behavior

### Panel states

**State A — Channel browsing (default):**

Two columns. Thread index gets full width for richer thread cards.

```
┌────────────┬─────────────────────────────────────────────┐
│            │                                             │
│  SIDEBAR   │            THREAD INDEX                     │
│  (260px)   │            (remaining width)                │
│            │                                             │
│            │  Thread cards with author, preview,         │
│            │  participants, reply count, timestamps      │
│            │                                             │
│            │  ┌─────────────────────────────────────┐    │
│            │  │ 📝 Start a new thread...       ⌘⏎   │    │
│            │  └─────────────────────────────────────┘    │
│            │                                             │
└────────────┴─────────────────────────────────────────────┘
```

**State B — Thread open:**

Three columns. Thread index compresses to a narrow navigation list. Thread detail takes the remaining space.

```
┌────────────┬──────────────┬──────────────────────────────┐
│            │              │                              │
│  SIDEBAR   │ THREAD INDEX │   THREAD DETAIL              │
│  (260px)   │ (compressed, │   (remaining width)          │
│            │  ~300px)     │                              │
│            │              │   Messages with avatars,     │
│            │  Compact     │   names, timestamps,         │
│            │  thread      │   markdown, streaming        │
│            │  cards       │                              │
│            │              │   ┌──────────────────────┐   │
│            │              │   │ Reply...        ⌘⏎   │   │
│            │              │   └──────────────────────┘   │
│            │              │                              │
└────────────┴──────────────┴──────────────────────────────┘
```

### Panel behavior rules

| Rule | Behavior |
|------|----------|
| **Thread open** | Thread detail slides in from the right. Thread index compresses. CSS transition for smooth animation. |
| **Thread close** | Click `✕` in thread header. Detail slides out. Index reclaims full width. |
| **Thread switch** | Click a different thread in the compressed index. Detail content replaces in-place (no slide animation for switching). |
| **Channel switch** | Closes any open thread. Loads new thread index at full width. |
| **Mobile (<768px)** | Single column. Thread detail replaces the index entirely. Back button `←` returns to index. |
| **Sidebar collapse** | 768-1100px: collapses to icon rail. <768px: hidden entirely, hamburger menu to toggle. |

### Height management

- Shell uses `height: 100vh` (not `min-height`)
- All panels scroll independently within their column
- Composer and reply box pinned at bottom of their respective panels
- No page-level scrollbar

---

## 4. Thread Index (Channel Feed)

The thread index is the main view when browsing a channel. It shows thread roots as rich cards.

### Thread card anatomy

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  Alice Chen                          2:30 PM today  │
│                                                     │
│  Deploy the auth fix to staging                     │
│  Need to get this out before the freeze window...   │
│                                                     │
│  ┌──┐ ┌──┐ ┌──┐                                    │
│  │AC│ │🤖│ │🔍│  3 participants · 4 replies         │
│  └──┘ └──┘ └──┘                     2 min ago ←     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

| Element | Description |
|---------|-------------|
| **Author name** | Display name of the thread creator (human or mind) |
| **Timestamp** | When the thread was created (see timestamp format rules in Section 7) |
| **Root message text** | First 2 lines of the opening message, truncated with ellipsis |
| **Participant avatars** | Stacked circles showing who has participated. Humans = initials. Minds = emoji/icon. Max 5 shown, `+N` overflow. |
| **Reply count** | "4 replies" with relative time of last activity |
| **Live indicator** | "Claude is responding..." with gentle pulse when a mind is actively streaming |
| **Unread dot** | Small primary-colored dot on threads with new activity since last visit |
| **Selected state** | When thread is open in detail panel: accent background + left border highlight |

### Thread card interactions

| Action | Result |
|--------|--------|
| Click card | Opens thread in detail panel (State B) |
| Hover | Subtle background highlight |
| Focus (keyboard) | Focus ring around card |

### Channel header

```
#engineering                                    ⟳  + New
Thread roots appear here
```

- Channel name with `#` prefix
- Refresh button `⟳` (subtle, for manual reload before real-time is implemented)
- `+ New` button — alternative entry point to the composer at the bottom, scrolls to it and focuses

### Composer (bottom of thread index)

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  📝  Start a new thread in #engineering...    ⌘⏎    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

- Collapsed by default: single-line input
- Expands to 3-4 rows on focus
- `Cmd+Enter` / `Ctrl+Enter` to submit
- No separate "Send" button — keyboard shortcut is primary. Small send icon inside the input for discoverability.
- Submitting creates a new thread and opens it in the detail panel

---

## 5. Thread Detail (Conversation View)

The thread detail is where all conversation happens. It opens as a slide-in panel when a thread card is clicked.

### Thread detail layout

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  Thread                                      ✕      │
│  Started by Alice Chen · #engineering · 2:30 PM     │
│                                                     │
│  ───────────────────────────────────────────────     │
│                                                     │
│  [Message: Alice Chen, 2:30 PM]                     │
│  [Message: Claude, 2:31 PM]                         │
│  [Message: Reviewer, 2:32 PM]                       │
│  [Streaming: Claude, typing...]                     │
│                                                     │
│  ───────────────────────────────────────────────     │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │ Reply to this thread...                ⌘⏎   │    │
│  │                              @Claude @Review │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Thread header

| Element | Description |
|---------|-------------|
| **"Thread" label** | Eyebrow text in primary/accent color |
| **Context line** | "Started by [Author] · #[channel] · [time]" — orients the user |
| **Close button `✕`** | Closes thread detail, returns to 2-column layout |

### Messages

See Section 7 (Message Design System) for full message anatomy.

Messages are rendered chronologically. Auto-scroll to bottom when new messages arrive. Scroll anchor at the bottom of the message list.

### Reply composer

- Collapsed single-line by default, expands on focus
- `Cmd+Enter` / `Ctrl+Enter` to submit
- **Mind mention chips** below the input: `@Claude`, `@Reviewer`. Clicking a chip directs the reply to that specific mind. Sets up multi-mind invocation architecture.
- Disabled when no thread is selected (shouldn't be visible in that state anyway)

### Streaming behavior

| Phase | Visual treatment |
|-------|-----------------|
| **Mind starts responding** | New message card appears with dashed border. Mind name + `● typing...` in muted accent. |
| **Tokens arriving** | Text grows inside the dashed card. Blinking cursor `▊` at the end. |
| **Response complete** | Card border becomes solid. `● typing...` replaced with timestamp. Card joins normal message flow. |

---

## 6. Sidebar Deep Dive

### Full sidebar layout

```
┌──────────────────────────────┐
│                              │
│  ▼ Acme Engineering      ⚙️  │
│    acme-eng · 3 members      │
│                              │
│  ════════════════════════════ │
│                              │
│  CHANNELS                    │
│  # general              ●    │
│  # engineering           3   │
│  # design-review             │
│  # ops                       │
│  + Add channel               │
│                              │
│  ════════════════════════════ │
│                              │
│  MINDS                       │
│  🤖 Claude            ● on  │
│  🔍 Reviewer          ● on  │
│                              │
│  ════════════════════════════ │
│                              │
│  TEAMMATES                   │
│  AC Alice Chen         ● on  │
│  BM Bob Martinez       ⚫    │
│                              │
│                              │
│  ════════════════════════════ │
│  AC Alice Chen               │
│     Sign out                 │
│                              │
└──────────────────────────────┘
```

### Channel unread indicators

| Indicator | Meaning |
|-----------|---------|
| No indicator | Channel is fully read |
| `●` (primary dot) | New activity since last visit |
| `3` (numeric badge) | Number of unread mentions (future: @-mentions) |
| **Bold channel name** | Any unread activity (in addition to dot/badge) |

### Add channel flow

`+ Add channel` is a text link. Clicking it expands inline into an input + button:

```
│  + Add channel               │
│                              │
│  ┌───────────────────┐ ┌───┐ │
│  │ channel-name      │ │Add│ │
│  └───────────────────┘ └───┘ │
```

After creation, the input collapses back to the `+ Add channel` link. The new channel is selected and the thread index loads (empty).

### Minds section

Each mind shows:
- Emoji/icon avatar with accent ring
- Configured name
- Presence dot (`● on` = active and available to respond)

Clicking a mind in the sidebar is a no-op for v1. Future: opens a DM-style direct conversation with that mind.

### Teammates section

Each teammate shows:
- Initials avatar
- Display name
- Presence indicator (`● on` / `⚫` away)

Presence is basic for v1: online = has an active session within the last 15 minutes.

---

## 7. Message Design System

### Message anatomy

Every message — human or mind — follows the same structural template:

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  [AVATAR]  [NAME]                  [TIMESTAMP]  │
│                                                 │
│           [MESSAGE BODY — markdown rendered]     │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Avatar system

| Participant type | Avatar content | Ring | Color |
|-----------------|---------------|------|-------|
| Human | 2-letter initials (e.g., "AC") | None | Deterministic from name hash — consistent across sessions |
| Mind | Emoji or icon (e.g., 🤖, 🔍) | 2px accent-colored ring | Configurable per mind in settings |
| Current user | Same as human | Thin primary ring | Always recognizable as "you" |

### Visual distinction: humans vs minds

The distinction is **subtle, not heavy-handed**. Minds are teammates, not a separate UI paradigm:

- Minds get a thin accent-colored ring around their avatar (humans don't)
- Mind names render in the accent/primary color; human names render in foreground color
- Streaming messages (minds only) use dashed borders and a pulsing `● typing...` indicator
- No different card backgrounds, no "bot" badges, no special borders for completed mind messages

### Markdown rendering

All message bodies render full markdown:

| Element | Treatment |
|---------|-----------|
| Paragraphs | Normal text, line-height 1.55 |
| Bold / italic | Standard markdown styling |
| Inline code | Monospace font, subtle background pill (`var(--muted)`) |
| Code blocks | Rounded container, dark background (`var(--input)`), monospace font (`var(--font-mono)`). Syntax highlighting. Copy button top-right. |
| Lists | Ordered and unordered, proper indentation |
| Links | Primary-colored, underline on hover |
| Blockquotes | Left border in accent color, muted background |

### Timestamp display rules

| Age | Format | Example |
|-----|--------|---------|
| < 1 minute | "Just now" | Just now |
| < 60 minutes | Relative | 5 min ago |
| Today | Time only | 2:30 PM |
| Yesterday | "Yesterday" + time | Yesterday, 2:30 PM |
| This year | Month + day + time | Apr 23, 2:30 PM |
| Older | Full date | Apr 23, 2025 |

### Streaming message treatment

| Phase | Border | Name area | Cursor |
|-------|--------|-----------|--------|
| Streaming | Dashed, accent-tinted | `● typing...` replaces timestamp | Blinking `▊` at end of text |
| Complete | Solid (matches other messages) | Timestamp appears | Cursor removed |

---

## 8. Sign-In & Routing

### Sign-in screen

Google sign-in only for v1. Single button, centered, minimal:

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│                                                      │
│                  MASTRA MINDSPACE                     │
│                                                      │
│            AI-powered team workspaces                 │
│                                                      │
│                                                      │
│       ┌──────────────────────────────────┐            │
│       │                                  │            │
│       │    🔵  Sign in with Google       │            │
│       │                                  │            │
│       └──────────────────────────────────┘            │
│                                                      │
│                                                      │
└──────────────────────────────────────────────────────┘
```

Background uses the existing radial gradient aesthetic (warm amber + cool blue on dark). Brand mark and tagline above the button. No other UI elements.

### Post-sign-in routing

```
User signs in (Google auth)
    │
    ├── Backend: auto-enroll in default public project
    │            (if configured and not already a member)
    │
    ├── 0 projects → "You don't have access to any projects yet.
    │                  Contact your admin for access."
    │                  (dead-end with sign-out option)
    │
    ├── 1 project  → Navigate directly to /chat/{projectId}
    │                 (zero friction, no picker)
    │
    └── 2+ projects → Project picker
                       (same UI as project switcher dropdown,
                        but full-screen centered as a modal)
```

Note: Only admins can create projects (via admin dashboard). Regular users are enrolled via the default public project mechanism or manual admin invitation. The project switcher dropdown hides `+ Create project` for non-admin users.

### Route structure

| Route | View |
|-------|------|
| `/` | Sign-in screen (if unauthenticated) or smart redirect (if authenticated) |
| `/chat/:projectId` | Chat view — sidebar + thread index (+ thread detail if open) |
| `/admin/test` | Dev-only admin console (guarded by `import.meta.env.DEV`) |

No settings route — settings are a modal overlaying the chat view.

---

## 9. Settings Modal

Settings live behind the gear icon `⚙️` in the project switcher. Opens as a centered modal with backdrop overlay. Chat view remains visible (blurred) behind it.

### Tab structure (v1)

Three tabs. Extensible — adding tabs later (Integrations, Billing) requires no layout changes.

#### Tab: General

| Field | Type | Notes |
|-------|------|-------|
| Project name | Editable text input | |
| Project slug | Read-only | System-generated |
| Created date | Read-only | |
| Archive project | Destructive action | Removes from active list, preserves data. Confirmation required. |

#### Tab: Members

| Element | Notes |
|---------|-------|
| Member list | Avatar + name + role (Owner/Member) + email |
| Invite input | Email input + "Send" button. Invite by email. |

Roles are Owner and Member only for v1. No role picker UI yet.

#### Tab: Minds

| Element | Notes |
|---------|-------|
| Mind cards | Name, emoji/icon, role description, model, system prompt preview |
| Edit action | Opens inline edit form for name, emoji, role, system prompt |
| Deactivate | Soft-disable (preserves conversation history, mind stops responding) |
| `+ Add` button | Opens a new mind creation form |

Mind configuration fields:

| Field | Description |
|-------|-------------|
| Name | Display name (e.g., "Claude", "Reviewer") |
| Icon/emoji | Visual identifier for avatar |
| Role | Short description (e.g., "Code review specialist") |
| Model | Which AI model powers this mind (e.g., `claude-sonnet-4-6`) |
| System prompt | The persona/instructions for this mind |

---

## 10. Design Tokens & Visual Language

The existing design system (`@mastra-mindspace/ui`) provides the foundation. The target UI extends it with these conventions:

### Color usage

| Purpose | Token | Usage |
|---------|-------|-------|
| Background | `--background` | Page/body background |
| Sidebar | `--sidebar` | Sidebar and thread drawer background |
| Cards | `--card` | Thread cards, message cards |
| Primary/Accent | `--primary` | Eyebrow text, mind name color, unread indicators, focus rings |
| Muted | `--muted-foreground` | Timestamps, metadata, secondary text |
| Destructive | `--destructive` | Error states, archive/delete actions |

### Typography

| Element | Font | Weight | Size |
|---------|------|--------|------|
| Project name | `--font-heading` (Manrope) | 600 | 1.1rem |
| Section headers (CHANNELS, MINDS) | `--font-heading` | 600 | 0.72rem, uppercase, letter-spaced |
| Channel names | `--font-sans` (Inter Tight) | 500 | 0.875rem |
| Thread card author | `--font-heading` | 600 | 0.9rem |
| Thread card body | `--font-sans` | 400 | 0.95rem |
| Message author | `--font-heading` | 600 | 0.875rem |
| Message body | `--font-sans` | 400 | 0.9rem, line-height 1.55 |
| Timestamps | `--font-sans` | 400 | 0.78rem |
| Code blocks | `--font-mono` (Consolas) | 400 | 0.82rem |

### Spacing & radius

| Element | Radius |
|---------|--------|
| Thread cards | `--radius-lg` (1.5rem) |
| Message cards | `--radius-md` (0.95rem) |
| Buttons | `--radius-sm` to `--radius-md` |
| Avatars | Fully round (50%) |
| Code blocks | `--radius-sm` (0.5rem) |
| Settings modal | `--radius-lg` |

### Transitions

| Interaction | Duration | Easing |
|-------------|----------|--------|
| Thread detail slide-in/out | 200ms | ease-out |
| Hover background changes | 160ms | ease |
| Sidebar collapse/expand | 200ms | ease-out |
| Composer expand on focus | 150ms | ease |
| Streaming cursor blink | 1s | step-end (CSS animation) |

---

## 11. Resolved Design Decisions

All previously open questions have been resolved:

### 11a. Unread/Notification System

**Decision:** Skip for v1. No read state tracking, no unread badges, no notification system. The sidebar channel list shows channels without activity indicators. This can be layered on later without architectural changes since unread state is purely additive (new DB table + UI badges).

### 11b. Mind Invocation Model

**Decision:** Explicit `@mention` required. Users direct messages to specific minds by mentioning them (e.g., `@Claude review this`). Threads can exist without AI participation — pure human discussions are valid.

The composer shows available mind mention chips below the input:

```
┌─────────────────────────────────────────────┐
│ Reply to this thread...                ⌘⏎   │
│                              @Claude @Review │
└─────────────────────────────────────────────┘
```

Clicking a chip inserts the mention into the message. The backend routes the message to the mentioned mind(s) for response.

### 11c. Channel Lifecycle

**Decision:**
- **Creation:** Any project member can create channels
- **Default:** Every mindspace includes a `#general` channel, auto-created during project bootstrap
- **Channel seeding:** Every new channel gets an auto-generated seed thread: `@librarian Give me a thorough usage guide to the #<channel-name> channel.` The Librarian mind responds with contextual guidance.
- **Archive/delete:** Deferred to future. Channels persist for now.

### 11d. Librarian Mind & Channel Seeding

The Librarian is a **system mind** — provisioned automatically with every mindspace.

| Field | Value |
|-------|-------|
| Name | Librarian |
| Icon | 📚 |
| Role | Channel guide and knowledge navigator |
| Model | Configurable (default: `claude-sonnet-4-6`) |
| Deletable | No — system mind. Can be reconfigured but not removed. |

**Channel creation flow:**

```
User clicks "+ Add channel"
    │
    ├── Inline input expands, user types name, clicks "Add"
    │
    ├── Backend: createProjectChannel()
    │     ├── Creates channel record
    │     ├── Creates seed thread with root message:
    │     │   "@librarian Give me a thorough usage guide
    │     │    to the #<channel-name> channel."
    │     └── Triggers Librarian mind to respond
    │
    └── Frontend:
          ├── Channel appears in sidebar (selected)
          ├── Thread index loads with the seed thread
          ├── Seed thread auto-opens showing Librarian streaming
          └── User sees the channel being "set up" in real-time
```

**Mindspace bootstrap flow:**

```
Admin creates project (via admin dashboard)
    │
    ├── Creates project + mindspace
    ├── Provisions Librarian mind (system default)
    ├── Creates #general channel
    └── Seeds #general with welcome thread:
        "@librarian Welcome! Give a brief orientation
         to this mindspace."
```

### 11e. Access Model & Default Public Project

**Decision:**
- Only admins can create projects and mindspaces (not in the regular UI)
- Regular users cannot create projects — they are enrolled automatically
- The admin can designate one project as the **default public project**
- Any user who signs in is automatically added to that project's organization with `member` role
- Unless explicitly added to other orgs, users only see the default project

**Post-sign-in routing (updated):**

```
User signs in (Google auth)
    │
    ├── User exists in DB?
    │     ├── Yes → load memberships
    │     └── No → create user record
    │
    ├── Default public project configured?
    │     └── Yes → auto-add user to that project's org
    │               (if not already a member)
    │
    ├── 0 projects → "You don't have access to any projects yet.
    │                  Contact your admin for access."
    │                  (dead-end with sign-out)
    │
    ├── 1 project  → Navigate directly to /chat/{projectId}
    │
    └── 2+ projects → Project picker
```

The project switcher dropdown hides `+ Create project` for non-admin users. Admin dashboard includes a simple "Set as default" toggle per project.

### 11f. Real-Time Updates

**Decision:** SSE (Server-Sent Events).

The backend already implements SSE for streaming agent responses. Extending it for real-time channel updates (new threads, new messages from other users) uses the same infrastructure:

- No Durable Objects required (avoids Cloudflare cost/complexity)
- No WebSocket upgrade needed
- Automatic reconnection built into the browser's `EventSource` API
- Stateless workers — scales naturally at the edge

**SSE channel for real-time updates:**

```
GET /api/projects/:projectId/channels/:channelId/events
  → event: new_thread     { thread, rootMessage }
  → event: new_message    { threadId, message }
  → event: thread_updated { threadId, lastMessageAt, replyCount }
  → event: mind_streaming { threadId, mindName, status: "started"|"done" }
```

The frontend opens one SSE connection per active channel. On channel switch, the old connection closes and a new one opens.

### 11g. Search

**Decision:** Simple full-text search over channel messages.

**Scope:**
- Default: search within current channel
- Toggle: `This channel` / `All channels` pill switch
- No filters, no fuzzy matching, no saved searches for v1

**UI: search overlay**

Triggered by 🔍 icon in the channel header (desktop) or top bar (mobile).

```
Desktop: overlay drops down from header, covers thread index
Mobile: full-screen overlay

┌───────────────────────────────────────┐
│ 🔍 Search #engineering...         ✕   │
├───────────────────────────────────────┤
│ This channel · All channels           │  ← scope toggle
├───────────────────────────────────────┤
│                                       │
│ Alice Chen · "Deploy auth fix"        │
│ ...freeze window closes at 5pm...     │
│                #engineering · 2h      │
│                                       │
│ Claude · "Deploy auth fix"            │
│ ...No expiry check on the token...    │
│                #engineering · 2h      │
│                                       │
└───────────────────────────────────────┘
```

**Result card anatomy:**
- Author name + avatar
- Thread title (root message text)
- Snippet with search terms **bolded** (1-2 lines of context)
- Channel name + relative time

**Interactions:**
- Click result → closes search, opens thread, scrolls to matching message (brief highlight flash)
- `Escape` → closes search overlay
- Typing → results update with 300ms debounce
- Pagination: 20 results at a time, load more on scroll

**Backend endpoint:**

```
GET /api/projects/:projectId/search?q=<query>&channelId=<optional>
```

Postgres `to_tsvector` / `ts_query` or simple `ILIKE` — sufficient for teams of 2-5.

### 11h. Keyboard Shortcuts

**Decision:** Skip for v1. Only `Cmd/Ctrl+Enter` for submit (already implemented).

### 11i. Error & Offline States

**Decision:** Four-layer error handling system.

**Layer 1 — Connection status banner:**

Thin bar at top of main content area. Only visible when connection state changes.

| State | Color | Content | Behavior |
|-------|-------|---------|----------|
| Connected | (invisible) | — | No banner shown |
| Reconnecting | Warning/yellow | `⚠ Connection lost. Reconnecting...` | Inputs disabled, content visible |
| Offline | Destructive/red | `✕ Unable to connect.` + Retry button | After 3 failed reconnects. Read-only. |
| Reconnected | Success/green | `✓ Connected` | Auto-dismisses after 3 seconds. Content refreshes. |

**Layer 2 — Inline action errors:**

Scoped to the action that caused them. Appear directly below the triggering input/button.

| Rule | Behavior |
|------|----------|
| Placement | Below the input/button that triggered the error |
| Auto-dismiss | After 8 seconds, or on retry |
| Styling | Muted destructive background, `role="alert"` |
| Scope | Independent per error zone — feed errors don't affect thread panel |
| Message text | Human-readable: "Couldn't create thread" not "Error: [500]" |
| Retry | User performs the action again. Error clears on new attempt. |

**Layer 3 — Failed message in thread:**

Optimistic messages that fail to send stay visible but marked:

```
┌─────────────────────────────────────────────┐
│ AC  Alice Chen                     2:35 PM  │
│                                             │
│     Fix the rate limit config               │
│                                             │
│     ⚠ Failed to send.  Retry · Discard     │
│                                             │
└─────────────────────────────────────────────┘
```

- Muted/faded text opacity
- Warning icon + "Failed to send"
- **Retry** link (re-sends) and **Discard** link (removes optimistic message)

**Layer 4 — Streaming interruption:**

When an SSE stream breaks mid-response:

```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│ 🤖  Claude                                  │
│     I'll review the diff. Here are the      │
│     changes I see:                          │
│                                             │
│     ⚠ Response interrupted.  Retry          │
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

Partial text preserved. Retry re-invokes the mind for a fresh response.

### 11j. Theming — Light/Dark Mode

**Decision:** Support both light and dark mode with system preference detection + manual toggle.

**Preference resolution:**

```
Manual toggle set (localStorage)?
    ├── Yes → Use stored preference
    └── No → Follow prefers-color-scheme media query
```

**Token architecture:**

Same semantic token names, two value layers. Uses OKLCH — most tokens just flip the lightness channel.

```css
:root {
  /* Dark mode (default, current values preserved) */
  --background: oklch(0.13 0.008 248);
  --foreground: oklch(0.95 0.008 60);
  --primary:    oklch(0.75 0.14 55);
  /* ... */
}

:root[data-theme="light"] {
  /* Light mode — flip lightness, adjust primary for contrast */
  --background: oklch(0.97 0.005 60);
  --foreground: oklch(0.15 0.008 248);
  --primary:    oklch(0.55 0.18 55);   /* deeper for WCAG AA on light */
  /* ... */
}
```

**Key light-mode adjustments:**

| Element | Dark mode | Light mode |
|---------|-----------|------------|
| Body gradient | Radials at 18%/14% opacity | Same radials at 6%/4% opacity |
| Code blocks | Light text on dark bg | Dark text on light gray bg |
| Card shadows | None (unnecessary on dark) | Subtle `box-shadow` for depth |
| Backdrop blur | `oklch(... / 0.88)` | `oklch(... / 0.92)` |

**Toggle location:** Sidebar user footer, next to sign out.

```
│ AC Alice Chen               │
│    ☀️/🌙 · Sign out          │
```

3-state cycle: ☀️ light → 🌙 dark → 💻 system → repeat.

**Implementation scope:**
1. Light mode token block in `packages/ui/src/styles.css`
2. Gradient/backdrop adjustments in `packages/web/src/styles.css`
3. Small `useTheme()` hook (localStorage + `data-theme` attribute)
4. Toggle button in sidebar footer

No component changes — everything uses semantic tokens.

### 11k. Mobile Layout

**Decision:** Stack-based navigation with persistent top bar.

**Navigation model:**

```
┌──────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│ ☰  #engineering   🔍 │     │ Sidebar overlay      │     │ ← Back   Thread    ✕ │
├──────────────────────┤     │ (slides from left)   │     ├──────────────────────┤
│                      │     │                      │     │                      │
│  Thread index        │ ──▶ │  Project switcher    │     │  Thread detail       │
│  (home state)        │     │  Channels            │     │  (replaces index)    │
│                      │ ◀── │  Minds               │     │                      │
│  Full-width cards    │     │  Teammates           │     │  Messages + reply    │
│                      │     │                      │     │                      │
│  📝 New thread...    │     │  Sign out            │     │  📝 Reply...         │
└──────────────────────┘     └──────────────────────┘     └──────────────────────┘
      Home                     Sidebar open                  Thread open
                             (overlay + backdrop)           (push navigation)
```

**Top bar behavior:**

| State | Left | Center | Right |
|-------|------|--------|-------|
| Thread index | `☰` hamburger | `#channel-name` | `🔍` search |
| Thread detail | `←` back | `Thread` | `✕` close |
| Sidebar open | — | — | `✕` close |

**Mobile rules:**

| Rule | Behavior |
|------|----------|
| Sidebar | Slide-over overlay from left, backdrop dims content. |
| Thread detail | Replaces thread index (push onto nav stack). `← Back` pops. |
| Swipe right | Gesture alternative to `← Back` (thread detail → index). |
| Search | Full-screen overlay. |
| Touch targets | All interactive elements ≥ 44x44px (WCAG 2.5.5). |
| Thread cards | Full-width, minimum 72px height. |
| Composer | 48px minimum height. |

---

## 12. Current State vs Target State Summary

| Area | Current | Target |
|------|---------|--------|
| Landing page | Admin debug console | Google sign-in → smart routing |
| Project navigation | Flat list of 48 projects | Dropdown switcher, one at a time, search + archive |
| Channel navigation | Nested under project accordion | Hero of sidebar, unread indicators |
| Thread index | Basic cards (text + reply count) | Rich cards (author, preview, participants, live status) |
| Thread detail | Always-visible empty drawer | Slide-in panel, hidden by default |
| Messages | "USER" / "ASSISTANT" labels, plain text | Named participants, avatars, full markdown |
| AI identity | Anonymous "assistant" | Named minds with personas and emoji avatars |
| Streaming | Dashed border card, raw text | Dashed card + typing indicator + cursor |
| Settings | Scattered across admin console | Modal with General/Members/Minds tabs |
| Composer | Always-expanded 4-row textarea + button | Collapsed single-line, expands on focus, keyboard-first |
| Responsive | 3-column always, stacks at breakpoints | Progressive: 2-col default, 3-col on thread open, single on mobile |
