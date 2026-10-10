# Day 3 — Filters, URL state, metrics, detail drawer

## What shipped

- `FilterBar`: severity + service multi-select, time-range presets, text
  search debounced 250ms
- `useUrlFilters` + pure `searchParamsToFilters`/`filtersToSearchParams`
  helpers: filters live in the URL query string
- `applyFilters`: a pure function now actually driving what both the
  table and the metrics panel display
- `MetricsPanel`: error rate/min, p95 latency/min, events/sec, via
  Recharts
- `DetailDrawer`: pretty-printed JSON, copy-traceId, related-events-by-
  traceId, with a hand-rolled focus trap, Esc-to-close, and focus
  restoration
- A deliberate styling detour: tried glassmorphism, then replaced it with
  a muted slate + semantic-accent palette more appropriate for a
  monitoring tool (see "Decisions & why" below — this ended up being a
  useful design-reasoning exercise, not just a cosmetic change)

## Decisions & why

### `applyFilters` runs client-side even though the server also filters

**Why:** The server's per-client filtered broadcast (Day 1) only
controls what gets *sent* going forward — it doesn't retroactively
remove events the client already received under a *previous* filter
set. Picture: you're subscribed with no filters, the buffer fills with a
mix of everything; you then click "ERROR only." The server starts
sending only ERROR events from that point on, but the buffer still has
all the old INFO/WARN events sitting in it. Without a client-side filter
pass, those old non-matching events would still render. `applyFilters`
is what actually decides "what does the table show right now," and it's
intentionally the *same logic* as the server's `matchFilters.ts` — two
separate implementations (different runtimes, can't share code directly)
but matching semantics.

### Filters live in the URL, with only the text query debounced

**Why:** URL-synced filters make a view shareable and bookmarkable
(reload the page, get the same filtered view back) — a real UX
requirement, not just nice-to-have. The query text field is specifically
debounced (250ms) before committing to the URL, while severity/service/
range toggles commit immediately: those are discrete click events (one
state change per click), but typing fires on every keystroke — writing
every keystroke to browser history would both spam the back button and
cause a URL-triggered re-render on every character typed.

**A deliberate, documented limitation:** the search input's local state
is only initialized from the URL once, on mount — it doesn't re-sync if
`filters.query` changes from an external source afterward (e.g. the
user clicking the browser's Back button). The alternative (re-syncing on
every `filters.query` change) would fight the user mid-keystroke, since
the URL only updates *after* the debounce fires, lagging behind what's
actually typed. This is a known, accepted tradeoff at this scope, not an
oversight — worth saying explicitly if asked, rather than looking
surprised that back/forward doesn't repopulate the search box.

### Metrics computed from *filtered* events, not the raw buffer

**Why:** If you filter the table down to one service, seeing the error
rate chart for all six services doesn't answer anything useful for the
dashboard's reason for existing. Real tools (Datadog, Grafana) update
their charts to match whatever's currently filtered — the metrics panel
should answer "what's going on with *what I'm looking at*," so it takes
the same `filteredEvents` the table does, as a prop, rather than reading
the store independently.

### `LogTable` and `MetricsPanel` take `events` as a prop, not from the store directly

**Why:** This was a mid-build refactor. Originally both components read
`useLogStore(s => s.events)` directly — the full, unfiltered buffer.
Once filtering needed to affect what's displayed, the options were: (a)
filter inside each component, duplicating the `applyFilters` call and
coupling both components to both the store *and* the filter state, or
(b) compute `filteredEvents` once in the parent and pass it down. (b)
makes both components pure/presentational — easier to test in isolation,
single source of truth for "what's currently visible."

### Recharts, upgraded from 2.x to 3.x mid-build

**Why:** Recharts 2.x's TypeScript definitions predate React 19's
updated JSX/component typings — React 19 removed implicit `children`
typing assumptions that 2.x's class-component-style types relied on,
producing real compile errors ("JSX element class does not support
attributes"), not warnings. Recharts 3.x's types are written against
current React. Pinning an older React version instead was rejected —
Next 16 and the React Compiler integration both assume React 19.

### Hand-rolled focus trap in `DetailDrawer`, not a library like `focus-trap-react`

**Why:** The WAI-ARIA dialog pattern is three behaviors: trap Tab/
Shift+Tab cycling within the dialog's focusable elements, close on Esc,
and restore focus to whatever was focused before the dialog opened. All
three fit in about 25 lines with no dependency. A library earns its
place when the problem is bigger than that (nested dialogs, portal
management, SSR focus timing edge cases) — this didn't need it, and
every dependency is something to audit, version-bump, and explain in an
interview as "why is this here."

### The glassmorphism-then-slate styling iteration

**Why this is worth including even though it "just changed colors":**
the first pass used glassmorphism with a playful indigo/sky/rose
gradient. When asked to use "serious colors, not gimmick colors," the
fix wasn't just picking different hex codes — it was recognizing that
*an SRE/observability tool has an established visual convention*
(Grafana, Datadog, financial dashboards: dark slate, near-zero
saturation, color spent only on semantic status — green=healthy,
amber=warning, red=critical) and that a decorative multi-hue gradient
actively works against the product's credibility, independent of how
polished it looks. The glass *effect* (blur, translucency) was kept —
it's not wrong on its own — but the backdrop driving it changed from
"pretty gradient" to "the same muted slate family as the rest of the
UI," which is what real monitoring tools that use this kind of
treatment (frosted panels over a dark workspace) actually do.

## Bugs hit

### `Date.now()` during render flagged as a compiler error

**Symptom:** Same class as Day 2's ref-mutation issue — a lint *error*
on `Date.now() - filters.from` inside a component body and inside a
`useMemo` callback.

**Root cause:** `Date.now()` is impure — calling it twice in a row gives
different answers — which violates the React Compiler's assumption that
rendering the same props/state twice produces the same result (needed
for safely discarding/retrying a render during concurrent features).

**Fix:** A small `useNow(intervalMs)` hook that holds "now" in `state`,
refreshed by a `setInterval` inside a `useEffect` — the only place in
the component tree allowed to actually read the clock. Both
`FilterBar`'s active-range highlighting and `MetricsPanel`'s trailing-
window cutoff now read from this hook instead of calling `Date.now()`
inline.

### A second, easy-to-miss instance of the same bug

`eventsPerSecond(events, windowSeconds, now = Date.now())` has a
*default parameter* that calls `Date.now()` — and default parameters
evaluate at call time. Calling `eventsPerSecond(recentEvents, 60)`
without the third argument from inside a `useMemo` still triggers the
same impurity, just hidden one level down in a function signature
instead of inline. Fix was to explicitly thread the same `now` value
through: `eventsPerSecond(recentEvents, 60, now)`.

**Why this is worth knowing:** it's a reminder that purity violations
can hide behind an innocent-looking function call — the lint rule only
catches it because `Date.now()` is one specific document recognized
call; a less obvious impure dependency (e.g. `Math.random()`, reading a
mutable module-level variable) could slip through without the compiler
flagging it, so understanding *why* the rule exists matters more than
memorizing what it catches.

## Likely interview questions

**"Why keep filter state in the URL instead of component state or
Zustand?"**
URL state is the only state that survives a page reload or gets carried
in a shared link for free — that's the specific requirement (a filtered
view should be bookmarkable/shareable). Zustand or local state would
need a separate persistence mechanism bolted on to get the same
property; the URL already *is* that mechanism.

**"Your metrics panel only looks at a 15-minute trailing window — why
not graph everything in the buffer?"**
Two reasons: relevance (a monitoring dashboard's "what's happening"
chart should emphasize recent behavior, not get visually dominated by
an hour-old spike that's long since resolved) and performance (scanning
and re-bucketing 200k events into per-minute/per-second buckets on every
render would be wasted work once the stream's been running a while — the
window bounds that cost regardless of how long the buffer has been
accumulating).

**"How did you decide the search box shouldn't re-sync from the URL
after the user starts typing?"**
By working through what happens if it did: the URL only updates *after*
the 250ms debounce fires, so if the input re-rendered from
`filters.query` on every URL change, the displayed text would
periodically jump to whatever was last committed, visibly lagging
behind what the user is still typing. Not re-syncing accepts a narrower,
named gap (browser back/forward won't visually repopulate the search
box) in exchange for the input never fighting the user's keystrokes —
the more common interaction by far.
