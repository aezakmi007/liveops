# Day 1 — Monorepo, fake log generator, WebSocket protocol

## What shipped

- An npm-workspaces monorepo: `apps/web` (Next.js, TS strict, Tailwind),
  `apps/ws-server` (Node + TS + `ws`), `packages/shared` (Zod schemas/types
  used by both)
- A fake log generator with three scenarios (`normal` / `incident` /
  `stress`), weighted severity distribution, batched broadcast every 200ms
  with ±20% jitter
- The two-way WebSocket protocol: client sends `subscribe` / `pause` /
  `resume`; server sends `batch` / `status`; per-client filtered broadcast;
  30s ping/pong heartbeat; `GET /history` for backfill
- `docker-compose.yml` running both services; GitHub Actions CI (lint →
  typecheck → test → build); deployed `ws-server` to Render

## Decisions & why

### Monorepo via npm workspaces, not pnpm or Turborepo

**Why:** npm was already available with no extra install; workspaces give
you shared local packages (`@liveops/shared`) with zero extra tooling. A
project this size doesn't need Turborepo's remote caching or task
orchestration — that's solving a problem (slow CI on a large multi-package
repo) this project doesn't have.

**Counter-argument I'd expect:** "pnpm is faster and stricter about
phantom dependencies." True — pnpm's strict `node_modules` layout catches
a class of bugs where a package accidentally works because something it
didn't declare happened to be hoisted next to it. For three packages, the
risk of hitting that bug is low enough that npm's simplicity wins. If this
grew to 10+ packages with a slow CI, I'd revisit.

### Shared Zod schemas, not just shared TypeScript types

**Why:** TypeScript types are compile-time only — they vanish by runtime
and can't stop a malformed WebSocket message from the network. Zod
schemas double as runtime validators, so `apps/web`'s `useLogStream` can
call `logEventSchema.safeParse(incomingData)` and actually reject garbage
instead of trusting it. The *types* (`LogEvent`, `Filters`) are inferred
*from* the schemas (`z.infer<typeof logEventSchema>`), so there's one
source of truth, not two things that can drift apart.

### WebSocket, not SSE or polling

**Why:** The spec requires two-way control — the client sends `pause`
mid-stream and `subscribe` with new filters without reconnecting. SSE is
one-way (server → client only); achieving "pause" over SSE would mean
either closing the connection (losing the stream) or having the server
guess intent from a side-channel HTTP call, which is clunkier than just
sending a message on the same connection you're already using.

**Counter-argument I'd expect:** "Why not SSE + a separate POST endpoint
for pause/subscribe?" That works, but now you have two connections and two
protocols to keep in sync (is the POST's effect visible yet on the SSE
stream?), versus one ordered message stream where `pause` and `batch`
can't race each other.

### Batching every 200ms with jitter, not one WebSocket message per event

**Why:** At 250-5000 events/sec, sending one WS message per event means
one React state update per event — at 5000/sec that's 5000 renders/sec,
which no UI survives. Batching at 200ms caps the *arrival* rate the client
has to react to at 5/sec, independent of how fast the server generates
events. ±20% jitter on batch size avoids a suspiciously metronomic demo
(real traffic is never that regular).

### Server-side ring buffer as "append + slice on overflow," not a true circular buffer

**Why:** A textbook ring buffer uses a fixed array with head/tail indices
and modulo arithmetic for O(1) writes. [RingBuffer.ts](../../apps/ws-server/src/ringBuffer.ts)
instead does `buffer.concat(incoming)` then `.slice()` off the overflow —
O(capacity) on the (rare) overflow path instead of O(1) always, in
exchange for code that's obviously correct without index-math bugs. At
200k capacity and a few writes/sec, that difference is invisible in
practice.

**Counter-argument I'd expect:** "Isn't that wasteful at scale?" Yes, if
capacity were 10M and writes were constant — then I'd switch to real
head/tail indices. At this scale it's the right tradeoff: simpler code,
no behavioral difference, and the cost is paid rarely (only when the
buffer is actually full).

### Per-connection state in a `WeakMap<WebSocket, ClientState>`, not a plain `Map`

**Why:** A plain `Map` keyed by socket would leak — you'd have to
remember to `delete` the entry in the `close` handler, and a crash path
that skips that cleanup leaks memory forever. A `WeakMap` lets the
JS engine garbage-collect the entry automatically once the socket itself
is collected, so there's no manual bookkeeping step to forget.

### Incident scenario spikes one *specific*, randomly-chosen service

**Why:** A uniform error-rate bump across all six services doesn't read
as "an incident" — it reads as "the generator is broken." Concentrating
elevated errors and 3x latency on one service (chosen once per process
start) produces a demo that looks like a real on-call page: "payments-api
is having a bad time," not "everything is slightly worse."

## Bugs hit

### Render deployment: Docker build context vs. "Root Directory" field

**Symptom:** `failed to calculate checksum of ref ...: "/apps/ws-server":
not found`, then after a partial fix, Docker could not find
`package.json` for the workspace at all.

**Root cause:** Render has three separate path fields — Root Directory,
Dockerfile Path, Docker Build Context Directory — and Root Directory
silently *re-bases* the other two. With Root Directory set to
`apps/ws-server/`, the Dockerfile's `COPY apps/ws-server/package.json`
(written assuming repo-root context) was being resolved from inside
`apps/ws-server` itself, so it was looking for a nonexistent nested
`apps/ws-server/apps/ws-server/`.

**Fix:** Cleared Root Directory entirely, kept Dockerfile Path
(`apps/ws-server/Dockerfile`) and Build Context Directory (`.`) both
relative to the actual repo root. Root Directory is for the *other*
deployment mode (plain Node build/start commands scoped to a subfolder) —
mixing it with a Dockerfile that assumes repo-root context was the error.

**Why this is worth knowing for the interview:** it's a concrete example
of a deploy platform having two different mental models (buildpack-style
vs. Docker-style) that don't compose the way you'd guess, and of reading
an error message literally (`"/apps/ws-server": not found`) to work
backward to which path was wrong, rather than guessing.

## Likely interview questions

**"Why WebSocket and not polling or SSE? When would SSE be the better
choice?"**
Two-way control is the deciding factor — see above. If the requirement
were "stream read-only data, no client-to-server control messages," SSE
is simpler: built-in reconnect, works over plain HTTP, no separate
protocol to implement. I'd pick SSE for something like a live score
ticker where the client never needs to tell the server anything.

**"Why batch at 200ms specifically — why not 50ms or 1s?"**
200ms (~5 updates/sec) is fast enough that a human perceives it as "live"
— below roughly 100-150ms, people can't tell the difference from
instantaneous — but slow enough to keep render frequency sane even in
stress mode. 1s would feel laggy for a monitoring tool; 50ms gives
10 renders/sec for no perceptible benefit over 5.

**"What happens if the ws-server process restarts? What do connected
clients see?"**
Every open WebSocket connection drops, triggering each client's
`onclose` → reconnect-with-backoff logic (Day 2). On reconnect, the
client calls `GET /history?since=<lastTs>` to backfill whatever it missed
— but the in-memory ring buffer is also gone on restart, so anything
not yet delivered before the crash is actually lost. That's a known,
accepted gap for a demo project; a production system would need the
history durably stored (e.g. in Kafka/a database) rather than in-process
memory for this to be a real guarantee.
