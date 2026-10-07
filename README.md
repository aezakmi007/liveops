# LiveOps

Real-time log and metrics observability dashboard. WebSocket log stream,
virtualized 100k+ row table, live metrics, filters synced to the URL.

> Day 1 of a 7-day build. This README grows each day; the full version
> (architecture diagram, performance numbers, scaling notes) lands on Day 7.

## What's here (Day 1)

- `apps/web` — Next.js (App Router) + TypeScript (strict) + Tailwind CSS
- `apps/ws-server` — Node + TypeScript WebSocket server: fake log generator,
  `normal` / `incident` / `stress` scenarios, batched broadcast, per-client
  filtered subscriptions, ping/pong heartbeat, `GET /history`
- `packages/shared` — `LogEvent` / `Filters` types and Zod schemas shared by
  both apps
- `docker-compose.yml` — runs both services with one command
- `.github/workflows/ci.yml` — lint, typecheck, test, build on every push

## Run locally

```bash
npm install
npm run dev        # web on :3000, ws-server on :4000
```

Or with Docker:

```bash
docker compose up
```

### ws-server scenarios

```bash
SCENARIO=incident npm run dev:ws-server   # error spike on one service
SCENARIO=stress npm run dev:ws-server     # ~5,000 events/sec
```

## Open-source dependencies (Day 1)

| Package | Licence |
|---|---|
| next, react, react-dom | MIT |
| tailwindcss | MIT |
| ws | MIT |
| zod | MIT |
| typescript | Apache-2.0 |
| eslint, typescript-eslint | MIT |
| tsx | MIT |
| vitest | MIT |
| concurrently | MIT |
