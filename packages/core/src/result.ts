/**
 * Uniform, redacted return contract for services, API routes and AI tools:
 * `{ ok, code, message, data, retryable, version }`.
 */
export const ERROR_CODES = [
  "OK",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "CONFLICT",
  "RATE_LIMITED",
  "ENTITLEMENT_EXCEEDED",
  "POLICY_BLOCKED",
  "CONFIRMATION_REQUIRED",
  "APPROVAL_INVALID",
  "INVALID_STATE",
  "NOT_CONNECTED",
  "PROVIDER_ERROR",
  "PROVIDER_UNAVAILABLE",
  "TIMEOUT",
  "INTERNAL_ERROR",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const RESULT_VERSION = 1 as const;

export interface OkResult<T> {
  ok: true;
  code: "OK";
  message: string;
  data: T;
  retryable: false;
  version: typeof RESULT_VERSION;
}
export interface ErrResult {
  ok: false;
  code: Exclude<ErrorCode, "OK">;
  message: string;
  data: null;
  retryable: boolean;
  version: typeof RESULT_VERSION;
  details?: Record<string, unknown>;
}
export type Result<T> = OkResult<T> | ErrResult;

export function ok<T>(data: T, message = "ok"): OkResult<T> {
  return { ok: true, code: "OK", message, data, retryable: false, version: RESULT_VERSION };
}

export function err(
  code: Exclude<ErrorCode, "OK">,
  message: string,
  options: { retryable?: boolean; details?: Record<string, unknown> } = {},
): ErrResult {
  return {
    ok: false,
    code,
    message,
    data: null,
    retryable: options.retryable ?? isRetryableCode(code),
    version: RESULT_VERSION,
    ...(options.details ? { details: options.details } : {}),
  };
}

export function isRetryableCode(code: ErrorCode): boolean {
  return code === "RATE_LIMITED" || code === "PROVIDER_UNAVAILABLE" || code === "TIMEOUT";
}

export const HTTP_STATUS: Record<ErrorCode, number> = {
  OK: 200,
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  ENTITLEMENT_EXCEEDED: 402,
  POLICY_BLOCKED: 422,
  CONFIRMATION_REQUIRED: 428,
  APPROVAL_INVALID: 409,
  INVALID_STATE: 409,
  NOT_CONNECTED: 424,
  PROVIDER_ERROR: 502,
  PROVIDER_UNAVAILABLE: 503,
  TIMEOUT: 504,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: Exclude<ErrorCode, "OK">;
  readonly retryable: boolean;
  readonly details: Record<string, unknown> | undefined;
  constructor(
    code: Exclude<ErrorCode, "OK">,
    message: string,
    options: { retryable?: boolean; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.retryable = options.retryable ?? isRetryableCode(code);
    this.details = options.details;
  }
  get status(): number {
    return HTTP_STATUS[this.code];
  }
  toResult(): ErrResult {
    return err(this.code, this.message, {
      retryable: this.retryable,
      ...(this.details ? { details: this.details } : {}),
    });
  }
}

/** Convert any thrown value into a redacted ErrResult (never leaks stack traces or secrets). */
export function toErrResult(error: unknown): ErrResult {
  if (error instanceof AppError) return error.toResult();
  if (error && typeof error === "object" && "name" in error && (error as { name: string }).name === "ZodError") {
    return err("VALIDATION_ERROR", "Invalid input");
  }
  return err("INTERNAL_ERROR", "Unexpected error");
}

export async function tryResult<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    return toErrResult(e);
  }
}
