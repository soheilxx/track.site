import pino, { type Logger, type LoggerOptions } from "pino";

/**
 * Structured JSON logging without PII. Redaction paths cover the most common
 * accidental leaks (identifiers, tokens, cookies). Callers must still avoid
 * passing raw visitor data.
 */
export const REDACT_PATHS = [
  "email",
  "*.email",
  "phone",
  "*.phone",
  "ip",
  "*.ip",
  "userAgent",
  "*.userAgent",
  "password",
  "*.password",
  "authorization",
  "*.authorization",
  "cookie",
  "*.cookie",
  "headers.authorization",
  "headers.cookie",
  "token",
  "*.token",
  "accessToken",
  "*.accessToken",
  "refreshToken",
  "*.refreshToken",
  "secret",
  "*.secret",
  "apiKey",
  "*.apiKey",
];

export type AppLogger = Logger;

let root: Logger | undefined;

export function createLogger(name: string, options: LoggerOptions = {}): Logger {
  if (!root) {
    root = pino({
      level: process.env.LOG_LEVEL ?? "info",
      redact: { paths: REDACT_PATHS, censor: "[redacted]" },
      base: { service: process.env.OTEL_SERVICE_NAME ?? "track-site" },
      timestamp: pino.stdTimeFunctions.isoTime,
      ...options,
    });
  }
  return root.child({ module: name });
}

export function silentLogger(): Logger {
  return pino({ level: "silent" });
}
