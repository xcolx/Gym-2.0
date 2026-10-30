// Port of ios/Gym 2.0/Core/Networking/APIError.swift

type ApiErrorKind =
  /** The request never reached the server (offline, timeout, server or proxy down). */
  | "transport"
  /** The session cookie is missing, expired or was invalidated (401). The session store logs the user out. */
  | "unauthorized"
  /** The server answered with an error status. `code` is the backend's error class name, e.g. "EmailVerificationError". */
  | "server"
  /**
   * The backend retired the API version of this app (410), it only works again after an update. Not a `server` error,
   * so that the sync doesn't treat it as a rejected change and keeps the local changes.
   */
  | "updateRequired"
  /** The response body wasn't the expected JSON. */
  | "decoding"
  | "invalidResponse";

const DEFAULT_MESSAGES: Partial<Record<ApiErrorKind, string>> = {
  transport: "Could not reach the server. Please check your internet connection.",
  decoding: "Received an unexpected response from the server.",
  invalidResponse: "Received an unexpected response from the server.",
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** The HTTP status, null for transport, decoding and invalid response errors */
  readonly status: number | null;
  /** The backend's error class name (e.g. "ExerciseNotFoundError"), only for `server` errors */
  readonly code: string | null;

  constructor(kind: ApiErrorKind, options: { message?: string; status?: number | null; code?: string | null; cause?: unknown } = {}) {
    super(options.message ?? DEFAULT_MESSAGES[kind] ?? "Something went wrong.", { cause: options.cause });
    this.name = "ApiError";
    this.kind = kind;
    this.status = options.status ?? (kind === "unauthorized" ? 401 : kind === "updateRequired" ? 410 : null);
    this.code = options.code ?? null;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** The HTTP status of an ApiError, null otherwise */
export function errorStatus(error: unknown): number | null {
  return isApiError(error) ? error.status : null;
}

/**
 * A 4xx the server will answer the same way again (`Error.isRejection` in SyncService.swift). Timeouts and rate
 * limits are worth retrying later, transport errors anyway.
 */
export function isRejection(error: unknown): boolean {
  if (!isApiError(error) || error.kind !== "server" || error.status === null) return false;
  return error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;
}

/** A message for the user for any error */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

/**
 * The error bodies the backend sends (APIErrorBody in Swift):
 * - app errors: {"error": "EmailVerificationError", "detail": "..."}
 * - HTTPException: {"detail": "..."}
 * - validation errors (422): {"detail": [{"msg": "...", ...}]}
 * - rate limits (429): {"error": "Rate limit exceeded: 5 per 1 minute"}
 * - retired API versions (410): {"error": "ApiVersionRetiredError", "detail": "..."}
 */
interface ApiErrorBody {
  error?: string | null;
  detail?: string | { msg: string }[] | null;
}

export function parseErrorBody(body: unknown): { message: string | null; code: string | null } {
  if (!body || typeof body !== "object") return { message: null, code: null };
  const { error, detail } = body as ApiErrorBody;
  const errorText = typeof error === "string" ? error : null;
  if (typeof detail === "string") return { message: detail, code: errorText };
  if (Array.isArray(detail)) {
    // Pydantic prefixes custom validator messages with "Value error, "
    const message = detail
      .map((issue) => (typeof issue?.msg === "string" ? issue.msg.replaceAll("Value error, ", "") : ""))
      .filter(Boolean)
      .join("\n");
    return { message: message || null, code: errorText };
  }
  // Rate limit responses put their message into `error`, there is no code then
  return { message: errorText, code: null };
}

const STATUS_TEXTS: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  413: "Payload Too Large",
  422: "Unprocessable Content",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

/** Like HTTPURLResponse.localizedString(forStatusCode:).capitalized */
export function statusText(status: number): string {
  return STATUS_TEXTS[status] ?? `HTTP Error ${status}`;
}
