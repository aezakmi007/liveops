# Day 2 — Client store, stream hook, virtualized table

## What shipped

- A Zustand store ([logStore.ts](../../apps/web/store/logStore.ts)) with a
  200k-capacity ring buffer, pause/resume semantics, and a pending-count
  badge
- `pushToRingBuffer` and `dedupeNewEvents` as separate pure functions,
  unit-tested independently of the store that uses them
- `useLogStream` — the hook that loads history via TanStack Query, opens
  the WebSocket, validates every event with Zod, dedupes, batches appends
  to one per animation frame, and reconnects with exponential backoff +
  jitter
- `useTabVisibility` — a thin Page Visibility API wrapper, deliberately
  generic (two callbacks, no WebSocket knowledge)
- `LogTable` — a TanStack Virtual–backed table that auto-scrolls to new
  rows unless the user has scrolled up or the stream is paused, with a
  "N new — jump to latest" indicator when scrolled away

## Decisions & why

### Zustand for stream state, TanStack Query for history — not one library for both

**Why:** These are different *kinds* of state. The live stream is
client-owned, high-frequency, and has no natural "is it stale" concept —
it's just "what's arrived so far." History is a one-shot (or occasional)
fetch from a server that TanStack Query already knows how to cache,
dedupe in-flight requests for, and expose loading/error states for,
without writing any of that by hand. Using Zustand for *both* would mean
reinventing TanStack Query's request lifecycle; using TanStack Query for
the live stream would mean fighting it, since React Query's model
assumes a request you can refetch, not an open socket pushing data
indefinitely.

**Counter-argument I'd expect:** "Why not Redux?" Redux's ceremony
(actions, reducers, middleware for async) buys you time-travel debugging
and a huge ecosystem — valuable at large-team scale where many people
touch the same state and need enforced structure. For one store with four
actions (`append`, `pause`, `resume`, `clear`), that ceremony is pure
overhead. Zustand gives the same "single source of truth, selector-based
subscriptions" value with a fraction of the boilerplate.

### Pure `pushToRingBuffer`/`dedupeNewEvents` functions, separate from the store

**Why:** A Zustand store is awkward to unit test directly — you either
reset global module state between tests or wire up a testing harness
around `create()`. Pulling the actual logic into plain functions that
take-input/return-output means Jest can test the *logic* (does
overflow correctly drop the oldest N items? does dedupe correctly handle
an id appearing in both the existing buffer and the incoming batch?)
without touching Zustand at all. The store becomes a thin
orchestration layer on top of already-tested logic.

### Dedupe via an incrementally-maintained `Set<string>`, not rebuilding from the array each time

**Why:** The obvious dedupe implementation is `new Set(buffer.map(e =>
e.id))` built fresh on every call — correct, but O(buffer length) every
single append, which at a 200k-capacity buffer means scanning 200k items
multiple times per second once the buffer fills. Instead, the store
keeps its own `seenIds` `Set` that's updated incrementally: add ids as
events come in, remove ids when `pushToRingBuffer` reports what got
dropped on overflow. Now dedupe is O(incoming batch size), not O(buffer
size).

### Batching WebSocket messages into one store update per animation frame

**Why:** Multiple WS `message` events can land within the same ~16ms
frame (especially in stress mode). Calling the store's `append()` — and
therefore triggering a React re-render — on *every* message would mean
multiple renders per frame, most of which the browser never even paints
(it can only show one frame). `useLogStream` instead pushes incoming
events into a plain array ref and schedules a single
`requestAnimationFrame` callback that flushes everything accumulated so
far into one `append()` call. This decouples "how fast the network
delivers data" from "how often React re-renders" — the thing section 6
of the spec calls out as the reason the 200ms server batching and this
render batching exist at two different layers.

### Exponential backoff with jitter for reconnect, capped at 30s

**Why:** Without backoff, a client whose server is down retries
instantly in a tight loop, hammering a server that's already struggling.
Exponential backoff (500ms, 1s, 2s, 4s...) backs off quickly. The random
jitter (±30% of the computed backoff) exists specifically to prevent a
*reconnect storm*: if the server restarts and 1000 clients all
disconnected at the same instant, pure exponential backoff means all
1000 retry at exactly the same moments — jitter spreads them out.

### `useTabVisibility` knows nothing about WebSockets

**Why:** It takes two callbacks (`onHide`, `onShow`) and nothing else.
The actual page wires `onHide` to `send({type:"pause"})` and `onShow` to
`send({type:"resume"})` + `backfill()`. This is a deliberate separation:
the hook is trivially unit-testable (mock `document.hidden`, assert the
callback fired — no WebSocket mocking needed at all), and it's reusable
for anything else that cares about tab visibility later.

## Bugs hit

### The WebSocket reconnect race condition (the big one)

**Symptom:** The table would populate on page load, then silently stop
receiving live updates — only a full page refresh would bring it back
temporarily.

**Root cause:** React's Strict Mode deliberately double-invokes effects
in development — mount, run cleanup, mount again — specifically to
surface bugs like this one. The original code tracked connection
lifetime with a single `unmounted` *ref*, shared across the whole hook's
lifetime:

1. First effect run opens WebSocket #1.
2. Strict Mode immediately runs cleanup: sets `unmounted.current = true`,
   calls `ws1.close()`.
3. Strict Mode re-runs the effect (the "real" mount): sets
   `unmounted.current = false` again, opens WebSocket #2 — this is the
   one that should actually serve the table.
4. WebSocket #1's `close` event is asynchronous — it doesn't fire the
   instant `.close()` is called, it fires later, after step 3 already
   flipped `unmounted.current` back to `false`.
5. When #1's stale `onclose` handler finally runs, it checks
   `if (unmounted.current) return` — sees `false` — and wrongly concludes
   it's still the active connection. It schedules a reconnect, which
   opens WebSocket #3, silently orphaning #2 (the one actually wired to
   the table) without ever closing it.

**How I found it:** I couldn't attach a browser to this session, so I
added temporary `console.debug` logging at each stage of the pipeline
(WS message received → store append → component re-render) and read it
back from Next.js's own dev-server log file
(`.next/dev/logs/next-development.log`, which mirrors everything the
browser console logs). Watching the batch counts and buffer size tick up
in lockstep proved the pipeline *was* working once isolated — which
narrowed the bug down to the connection lifecycle itself, not the data
flow.

**Fix:** Scope "is this still the current connection" to the individual
`connect()` call via a local `active` variable (closed over fresh on
every effect invocation) instead of a hook-wide ref, and additionally
check `wsRef.current === ws` inside every handler — i.e., "am I still
the socket the hook currently considers canonical," not just "has the
whole hook been torn down." A stale socket's late-arriving events are
now inert no matter when they arrive.

**Why this is worth knowing for the interview:** it's a genuine
concurrency bug class — "the thing I'm checking can change between when
I read it and when the delayed event I'm checking it against actually
fires" — and it only reproduces because of a deliberate React dev-mode
behavior most people don't think carefully about. Being able to explain
*why* Strict Mode double-invokes effects (to catch exactly this kind of
non-idempotent cleanup) is as important as the fix itself.

### Missing CORS headers on the REST endpoints

**Symptom:** `TypeError: Failed to fetch` in the browser console,
specifically from the `/history` fetch call — not an HTTP error status,
a network-level failure the browser refuses to let JS even see the
response for.

**Root cause:** `ws-server`'s plain `http.createServer` handler never set
`Access-Control-Allow-Origin`. A browser on `localhost:3001` fetching
`localhost:4000/history` is a cross-origin request by the spec (different
port = different origin), and without that header the browser blocks the
response before JS code ever sees it — which surfaces as a generic
"Failed to fetch" with no status code, easy to mistake for a networking
or DNS problem rather than a CORS policy block.

**Fix:** `res.setHeader("Access-Control-Allow-Origin", "*")` plus an
`OPTIONS` preflight handler. Open to all origins deliberately — there's
no auth boundary to protect on this demo endpoint, and hardcoding one
origin just breaks the moment the frontend moves to a different URL
(e.g. Vercel's generated domain).

### React 19's compiler flags mutating a ref during render

**Symptom:** A lint *error* (not warning): "Cannot access refs during
render" / "Cannot update ref during render," on a very standard pattern
— keeping a ref in sync with the latest prop value so a callback
registered once doesn't close over a stale value.

**Root cause:** Next 16 / React 19 ships a compiler that assumes
components are pure during render (same inputs → same output, safely
re-run or discarded) to enable optimizations like time-slicing. Mutating
a ref's `.current` *during* render is a side effect that breaks that
assumption, even though it's a harmless, extremely common pattern in
practice.

**Fix:** Moved the ref sync into a `useEffect` (`useEffect(() => {
filtersRef.current = filters }, [filters])`) instead of doing it inline
in the render body. Functionally identical outcome, now compiler-legal.

**Why this is worth knowing:** it's a live example of a language/
framework's tooling getting *stricter* in a way that catches previously-
accepted patterns — good material for "how do you stay current with a
fast-moving framework."

## Likely interview questions

**"Walk me through what happens when 5,000 events/sec arrive — where
does the bottleneck get absorbed?"**
Three layers each absorb a different part of it: the server batches
generation+broadcast to 5/sec regardless of per-event rate; the client's
`requestAnimationFrame` batching collapses however many WS messages
arrived within one frame into a single store update; and the virtualized
table only ever renders the ~20-30 rows actually visible in the
viewport, regardless of whether the underlying array has 500 or 200,000
items.

**"How do you avoid memory leaks in `useLogStream`?"**
The effect's cleanup function covers every resource it opened: clears
the pending reconnect `setTimeout`, cancels the pending
`requestAnimationFrame`, and closes the socket — the last of which,
post-fix, is checked against `wsRef.current === ws` so a now-superseded
socket can't resurrect work after cleanup already ran.

**"Why memoize `Row` in the table — what would break without it?"**
`virtualizer.getVirtualItems()` returns a new array reference on every
scroll event (even if the *actual rows* haven't changed), which would
otherwise cause React to re-render every visible `Row` on every pixel of
scroll. `memo()` on `Row` means a row only re-renders if its own
`event` prop object actually changed — scrolling alone doesn't touch
that.
