import { z } from "zod";

export const LOG_LEVELS = ["INFO", "WARN", "ERROR", "FATAL"] as const;

export const logLevelSchema = z.enum(LOG_LEVELS);
export type LogLevel = z.infer<typeof logLevelSchema>;

export const SERVICES = [
  "payments-api",
  "auth",
  "gateway",
  "inventory",
  "notifications",
  "search",
] as const;

export const logEventSchema = z.object({
  id: z.string().uuid(),
  ts: z.number(),
  level: logLevelSchema,
  service: z.string(),
  message: z.string(),
  traceId: z.string(),
  latencyMs: z.number().nonnegative(),
  meta: z.record(z.unknown()).optional(),
});
export type LogEvent = z.infer<typeof logEventSchema>;

export const filtersSchema = z.object({
  levels: z.array(logLevelSchema),
  services: z.array(z.string()),
  query: z.string(),
  from: z.number().optional(),
  to: z.number().optional(),
});
export type Filters = z.infer<typeof filtersSchema>;

export const EMPTY_FILTERS: Filters = {
  levels: [],
  services: [],
  query: "",
};

export const scenarioSchema = z.enum(["normal", "incident", "stress"]);
export type Scenario = z.infer<typeof scenarioSchema>;

export const clientMsgSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("subscribe"), filters: filtersSchema }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
]);
export type ClientMsg = z.infer<typeof clientMsgSchema>;

export const serverMsgSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("batch"),
    events: z.array(logEventSchema),
    serverTs: z.number(),
  }),
  z.object({ type: z.literal("status"), scenario: scenarioSchema }),
]);
export type ServerMsg = z.infer<typeof serverMsgSchema>;
