# TKTool

A personal team coordination tool for an engineering team lead. It tracks
todos, 1:1s, team meetings, capacity planning, and per-person growth signals
in one place. I built it for myself, use it daily, and open-sourced it because
it turned out more useful than expected — not because it wants to be a product.

The UI is in German. So is the data model in places (`werktage`, `allokiert`,
`supportMonate`). Historically grown, not going to change.

## Core concepts

### One JSON file, your folder

All data lives in a single `tktool-data.json` in a directory *you* pick via
the File System Access API. The directory handle is persisted in IndexedDB,
so you pick once. No backend, no accounts, no cloud — put the folder in
whatever sync you already trust (or none). Backup/restore is "download the
JSON" / "import the JSON". The reasoning: this is personal data about real
people; the least surprising storage model is a file the user can see,
diff, and delete.

### Capacity blocks

Planning works in *blocks* (ticket, project, incident, absence) drawn on a
per-person timeline, created and resized by dragging. Capacity is computed,
never stored: workdays in the window minus allocated block days equals free
days. People can be flagged for support duty per month (`supportMonate`),
shown as a SUP badge. The deliberate choice here is workday granularity —
no hours, no story points. A team lead needs to see "who is free next week",
not run a resource-leveling algorithm.

### 1:1 carryover

When opening a 1:1, the tool computes what to talk about: open follow-ups
from earlier meetings, open todos assigned to the person, and growth signals
recorded since the *previous* 1:1 with that person. Nothing is copied or
stored — it's derived at render time from the items that already exist.
This is the feature the tool exists for: never walking into a 1:1 without
context, and never maintaining a separate "agenda" document that drifts.

### Growth signals

Highlights and concerns are logged per person as dated items. A rolling
30-day window aggregates them into a simple signal per team member, and
monthly reviews summarize them per month. The point is trend over incident:
one concern is a Tuesday, three in a month is a conversation.

### Sudo mode

Sensitive content — growth journal, personal notes, development direction —
is hidden behind a toggle (`Cmd/Ctrl+Shift+S`). This exists for exactly one
scenario: screen sharing. The rest of the tool is safe to project in a team
meeting; sudo mode keeps it that way.

## Design philosophy

Terminal brutalism, more or less: system monospace everywhere, amber accent,
near-zero border radius, lowercase labels, dense layouts. The reasoning is
function over decoration — the tool should feel like an instrument you
operate, not a SaaS landing page that happens to store data. There are
eleven themes (gruvbox, mocha, tokyo night, matrix, …) because theming a
CSS-variable-based design is cheap and occasionally fun.

## Running it

Open in a Chromium-based browser. The File System Access API
(`showDirectoryPicker`) is not available in Firefox or Safari. No build
step, no dependencies, nothing to install.

On first launch you pick a data directory; `tktool-data.json` is created
there.

## Architecture decisions

- **Vanilla JS, zero dependencies.** `index.html`, `styles.css` (plus one
  CSS file per theme), and one JS file per view/domain under `js/`, loaded
  as plain script tags in dependency order. No modules, no build — it works
  opened straight from the filesystem. Nothing to update, nothing that
  breaks in five years.
- **Full re-render on navigation.** Every view change rebuilds its DOM via
  `innerHTML`. At this data size (one team, one year) it's instant, and it
  removes an entire class of state-sync bugs.
- **Derived over stored.** Capacity, carryover, signals, and activity
  summaries are computed from raw items at render time. Stored aggregates
  go stale; computed ones don't.
- **Shared global scope across JS files.** The split into `js/data.js`,
  `js/helpers.js`, view files, and `js/ui.js` is for navigability, not
  encapsulation — everything is still global, and inline `onclick` handlers
  depend on that. Load order matters: data and helpers first, init last.
- **Keyboard-first capture.** `Ctrl+K` captures an item from anywhere,
  `Ctrl+J` toggles a free-form quicknotes drawer. Friction at capture time
  is the main reason tracking tools die.

## Non-goals

- Not a Jira/Linear replacement — no sprints, no estimates, no workflow.
- Not multi-tenant, not collaborative, no auth. One user, one file.
- Not mobile-first. It's used on a desktop, next to a calendar.
- Not configurable. Item types, block types, and views encode how I work;
  fork it if you work differently.
