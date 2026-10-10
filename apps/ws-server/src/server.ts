import { createServer } from "node:http";
import { URL } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import {
  clientMsgSchema,
  EMPTY_FILTERS,
  scenarioSchema,
  type Filters,
  type LogEvent,
  type Scenario,
  type ServerMsg,
} from "@liveops/shared";
import { generateEvents, jitterCount } from "./generator.js";
import { RingBuffer } from "./ringBuffer.js";
import { matchesFilters } from "./matchFilters.js";
import { SERVICES } from "@liveops/shared";

const PORT = Number(process.env.PORT ?? 4000);
const BATCH_INTERVAL_MS = Number(process.env.BATCH_INTERVAL_MS ?? 200);
const EVENTS_PER_BATCH = Number(process.env.EVENTS_PER_BATCH ?? 50);
const SCENARIO: Scenario = scenarioSchema.parse(process.env.SCENARIO ?? "normal");
const HISTORY_CAPACITY = Number(process.env.HISTORY_CAPACITY ?? 200_000);
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS ?? 30_000);

const history = new RingBuffer(HISTORY_CAPACITY);
// Fixed per-process so the incident demo always spikes the same service.
const incidentService = SERVICES[Math.floor(Math.random() * SERVICES.length)];

interface ClientState {
  filters: Filters;
  paused: boolean;
  isAlive: boolean;
}

const clientState = new WeakMap<WebSocket, ClientState>();

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcastBatch(events: LogEvent[]): void {
  history.push(events);
  for (const ws of wss.clients) {
    const state = clientState.get(ws);
    if (!state || state.paused) continue;

    const matched = events.filter((e) => matchesFilters(e, state.filters));
    if (matched.length === 0) continue;

    send(ws, { type: "batch", events: matched, serverTs: Date.now() });
  }
}

const server = createServer((req, res) => {
  // The REST endpoints below are meant to be called from any origin (local
  // dev on a different port, a deployed frontend on a different domain) —
  // there's no auth boundary to protect in this demo, so allow all origins
  // rather than hardcoding one that breaks as soon as the frontend moves.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "GET" && url.pathname === "/history") {
    const since = url.searchParams.get("since");
    const limit = url.searchParams.get("limit");

    const events = since !== null ? history.since(Number(since)) : history.recent(Number(limit ?? 5000));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ events, serverTs: Date.now() }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, scenario: SCENARIO, historySize: history.size }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  clientState.set(ws, { filters: EMPTY_FILTERS, paused: false, isAlive: true });
  send(ws, { type: "status", scenario: SCENARIO });

  ws.on("pong", () => {
    const state = clientState.get(ws);
    if (state) state.isAlive = true;
  });

  ws.on("message", (raw) => {
    const state = clientState.get(ws);
    if (!state) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return; // ignore malformed frames
    }

    const result = clientMsgSchema.safeParse(parsed);
    if (!result.success) return;

    const msg = result.data;
    if (msg.type === "subscribe") {
      state.filters = msg.filters;
    } else if (msg.type === "pause") {
      state.paused = true;
    } else if (msg.type === "resume") {
      state.paused = false;
    }
  });

  // Subscriptions are removed automatically: client lookup is a WeakMap
  // keyed on the socket, so state is garbage-collected once the socket is.
  ws.on("close", () => {
    clientState.delete(ws);
  });
});

// Ping/pong heartbeat: terminates clients that stop responding (sleep,
// Wi-Fi drop, crash) since those never fire a `close` event on their own.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    const state = clientState.get(ws);
    if (!state) continue;
    if (!state.isAlive) {
      ws.terminate();
      continue;
    }
    state.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_INTERVAL_MS);

const generatorInterval = setInterval(() => {
  const base =
    SCENARIO === "stress" ? 1000 : SCENARIO === "incident" ? 200 : EVENTS_PER_BATCH;
  const count = jitterCount(base);
  const events = generateEvents(count, { scenario: SCENARIO, incidentService });
  broadcastBatch(events);
}, BATCH_INTERVAL_MS);

server.listen(PORT, () => {
  console.log(
    `[ws-server] listening on :${PORT} (scenario=${SCENARIO}, batch=${EVENTS_PER_BATCH}/${BATCH_INTERVAL_MS}ms, incidentService=${incidentService})`,
  );
});

function shutdown(): void {
  clearInterval(heartbeat);
  clearInterval(generatorInterval);
  wss.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
