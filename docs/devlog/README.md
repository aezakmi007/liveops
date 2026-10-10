# LiveOps build log

A day-by-day record of what was built and, more importantly, *why* — the
alternatives considered, the tradeoffs accepted, and the real bugs hit along
the way. Written so the decisions can be explained and defended later (a
resume line is a claim; this is the evidence behind it), not just so the
code can be read back.

Each entry follows the same shape:
1. **What shipped** — the concrete deliverable
2. **Decisions & why** — the design choice, the alternative(s) it beat, and
   the reason
3. **Bugs hit** — real defects found during the build, root-caused, not
   hypothetical
4. **Likely interview questions** — mapped to this day's work specifically,
   not generic

## Index

- [Day 1 — Monorepo, fake log generator, WebSocket protocol](day-01-setup-and-stream-server.md)
- [Day 2 — Client store, stream hook, virtualized table](day-02-client-stream-and-table.md)
- [Day 3 — Filters, URL state, metrics, detail drawer](day-03-filters-metrics-drawer.md)

## How to use this before an interview

- Read the "Decisions & why" sections out loud to yourself — if an
  explanation feels shaky, that's the spot to dig into the actual code
  before the interview, not during it.
- The "Bugs hit" sections are your strongest material for "tell me about a
  bug you fixed" — they're real, they have a root cause you can explain,
  and they show debugging process, not just the fix.
- Where a decision has a documented tradeoff (e.g. "this misses X case"),
  that's a deliberate scope boundary, not an oversight — say so if asked,
  rather than being caught off guard.
