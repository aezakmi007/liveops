import { randomUUID } from "node:crypto";
import type { LogEvent, LogLevel, Scenario } from "@liveops/shared";
import { SERVICES } from "@liveops/shared";

const MESSAGES_BY_LEVEL: Record<LogLevel, string[]> = {
  INFO: [
    "request completed",
    "cache hit",
    "health check ok",
    "job scheduled",
    "connection established",
  ],
  WARN: [
    "retrying request",
    "slow query detected",
    "deprecated endpoint called",
    "connection pool near capacity",
  ],
  ERROR: [
    "request failed",
    "upstream timeout",
    "validation failed",
    "unhandled exception",
  ],
  FATAL: ["service crashed", "out of memory", "database unreachable"],
};

// Weighted so most logs are INFO, with a long tail of warnings and few errors.
const LEVEL_WEIGHTS: Array<[LogLevel, number]> = [
  ["INFO", 0.82],
  ["WARN", 0.12],
  ["ERROR", 0.05],
  ["FATAL", 0.01],
];

function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) throw new Error("pick() called on empty array");
  return item;
}

function pickLevel(weights: Array<[LogLevel, number]>): LogLevel {
  const roll = Math.random();
  let acc = 0;
  for (const [level, weight] of weights) {
    acc += weight;
    if (roll <= acc) return level;
  }
  return "INFO";
}

function latencyForLevel(level: LogLevel, incidentService?: string, service?: string): number {
  const base = level === "FATAL" ? 800 : level === "ERROR" ? 400 : level === "WARN" ? 150 : 40;
  const spike = incidentService && service === incidentService ? 3 : 1;
  const jitter = Math.random() * base * 0.6;
  return Math.round((base + jitter) * spike);
}

export interface GenerateOptions {
  scenario: Scenario;
  /** Service experiencing the incident spike, chosen once per process so the demo stays consistent. */
  incidentService?: string;
}

export function generateEvents(count: number, options: GenerateOptions): LogEvent[] {
  const { scenario, incidentService } = options;
  const events: LogEvent[] = [];

  for (let i = 0; i < count; i++) {
    const service = pick(SERVICES);

    let weights = LEVEL_WEIGHTS;
    if (scenario === "incident" && service === incidentService) {
      // Error spike concentrated on one service.
      weights = [
        ["INFO", 0.35],
        ["WARN", 0.2],
        ["ERROR", 0.35],
        ["FATAL", 0.1],
      ];
    } else if (scenario === "stress") {
      weights = [
        ["INFO", 0.78],
        ["WARN", 0.14],
        ["ERROR", 0.06],
        ["FATAL", 0.02],
      ];
    }

    const level = pickLevel(weights);

    events.push({
      id: randomUUID(),
      ts: Date.now(),
      level,
      service,
      message: pick(MESSAGES_BY_LEVEL[level]),
      traceId: randomUUID(),
      latencyMs: latencyForLevel(level, scenario === "incident" ? incidentService : undefined, service),
    });
  }

  return events;
}

/** ±20% jitter around a base batch size, always at least 1. */
export function jitterCount(base: number): number {
  const factor = 0.8 + Math.random() * 0.4;
  return Math.max(1, Math.round(base * factor));
}
