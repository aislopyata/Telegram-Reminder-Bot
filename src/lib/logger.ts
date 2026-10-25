type LogLevel = "debug" | "info" | "warn" | "error";

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function configuredLevel(): LogLevel {
  const value = process.env.LOG_LEVEL;
  return value === "debug" || value === "warn" || value === "error" ? value : "info";
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message.slice(0, 500),
      // Stacks can contain query fragments, so they are only emitted in debug.
      ...(configuredLevel() === "debug" ? { stack: error.stack } : {}),
    };
  }
  return { message: String(error).slice(0, 500) };
}

/**
 * Structured logging without third-party dependencies. Never pass secrets in
 * fields; only identifiers and outcomes.
 */
export function log(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  if (levelWeight[level] < levelWeight[configuredLevel()]) return;

  const entry = {
    level,
    event,
    time: new Date().toISOString(),
    ...fields,
  };

  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, fields?: Record<string, unknown>) => log("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => log("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => log("warn", event, fields),
  error: (event: string, error?: unknown, fields?: Record<string, unknown>) =>
    log("error", event, { ...fields, error: serializeError(error) }),
};
