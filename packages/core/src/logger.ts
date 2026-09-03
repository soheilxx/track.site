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
    // serverless runtimes (Vercel, Lambda) freeze the process right after the response: write synchronously so nothing is lost
    const serverless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    root = pino(
      {
        level: process.env.LOG_LEVEL ?? "info",
        redact: { paths: REDACT_PATHS, censor: "[redacted]" },
        base: { service: process.env.OTEL_SERVICE_NAME ?? "track-site" },
        timestamp: pino.stdTimeFunctions.isoTime,
        ...options,
      },
      serverless ? pino.destination({ fd: 1, sync: true }) : undefined,
    );
  }
  return root.child({ module: name });
}

export function silentLogger(): Logger {
  return pino({ level: "silent" });
}
