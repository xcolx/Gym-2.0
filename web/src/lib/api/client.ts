// Port of ios/Gym 2.0/Core/Networking/APIClient.swift and Endpoint.swift. Requests go through the same-origin proxy
// (src/proxy.ts), so the browser sends the HTTP-only session cookie along by itself and the client never sees it.

import { updateAvailable, updateRequired } from "./app-update";
import { keysToCamelCase, keysToSnakeCase } from "./case";
import { ApiError, parseErrorBody, statusText } from "./errors";

const API_VERSION = "v1";
/** Relative to the origin of the page, proxied to the backend by Next.js */
export const API_BASE_PATH = `/api/${API_VERSION}`;
/** The default timeout of a request, like URLSessionConfiguration.timeoutIntervalForRequest on iOS */
const DEFAULT_TIMEOUT_MS = 30_000;

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** One request to the backend. The path is relative to the API base path (e.g. "/auth/login/email"). */
interface Endpoint {
  method: HttpMethod;
  path: string;
  /** Names as the backend expects them (snake_case), undefined and null values are left out */
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Sent as JSON with snake_case keys, null and undefined properties are left out (see keysToSnakeCase) */
  json?: unknown;
  /** Sent as multipart/form-data, e.g. for the endpoints that take a file. See `formData()`. */
  form?: FormData;
  /** Overrides the default timeout, in milliseconds */
  timeoutMs?: number;
  signal?: AbortSignal;
}

// MARK: - Events

type Listener = (path: string) => void;
const unauthorizedListeners = new Set<Listener>();

/**
 * Called for every 401 response, with the path of the request. The session store logs the user out then (keeping the
 * local data), unless it was a failed login. Returns a function that removes the listener.
 */
export function onUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

// MARK: - Requests

function endpointUrl(endpoint: Pick<Endpoint, "path" | "query">): string {
  let url = API_BASE_PATH + endpoint.path;
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(endpoint.query ?? {})) {
    if (value !== null && value !== undefined) params.append(name, String(value));
  }
  // URLSearchParams encodes "+" as %2B, so the "+00:00" of a timestamp isn't read as a space by the server
  const query = params.toString();
  if (query) url += `?${query}`;
  return url;
}

async function perform(endpoint: Endpoint): Promise<Response> {
  const headers = new Headers({ Accept: "application/json" });
  let body: BodyInit | undefined;
  if (endpoint.json !== undefined) {
    body = JSON.stringify(keysToSnakeCase(endpoint.json));
    headers.set("Content-Type", "application/json");
  } else if (endpoint.form) {
    // The browser sets the multipart Content-Type with the boundary itself
    body = endpoint.form;
  }

  // Aborted by the timeout or by the caller (AbortSignal.any isn't available in older Android browsers)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), endpoint.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  if (endpoint.signal?.aborted) controller.abort();
  endpoint.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const signal = controller.signal;

  let response: Response;
  try {
    response = await fetch(endpointUrl(endpoint), {
      method: endpoint.method,
      headers,
      body,
      credentials: "include",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    // Aborted by the caller: rethrown as is, so callers can tell it apart from being offline
    if (endpoint.signal?.aborted) throw error;
    throw new ApiError("transport", { cause: error });
  } finally {
    clearTimeout(timer);
    endpoint.signal?.removeEventListener("abort", abortFromCaller);
  }

  if (response.status === 401) {
    unauthorizedListeners.forEach((listener) => listener(endpoint.path));
  }
  // The backend only uses 410 for retired API versions
  if (response.status === 410) {
    updateRequired();
  } else if (response.headers.has("Deprecation")) {
    updateAvailable();
  }

  if (!response.ok) {
    throw await errorFor(response);
  }
  return response;
}

async function errorFor(response: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // e.g. an HTML error page of the proxy
  }
  const { message, code } = parseErrorBody(body);
  const text = message ?? statusText(response.status);
  if (response.status === 401) return new ApiError("unauthorized", { message: text });
  if (response.status === 410) return new ApiError("updateRequired", { message: text });
  return new ApiError("server", { status: response.status, code, message: text });
}

/** Sends the request and decodes the JSON response, with camelCase keys. */
export async function send<T>(endpoint: Endpoint): Promise<T> {
  const response = await perform(endpoint);
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    throw new ApiError("transport", { cause: error });
  }
  if (!text) return undefined as T;
  try {
    return keysToCamelCase(JSON.parse(text)) as T;
  } catch (error) {
    throw new ApiError("decoding", { cause: error });
  }
}

/** For requests whose response body isn't needed. */
export async function sendVoid(endpoint: Endpoint): Promise<void> {
  const response = await perform(endpoint);
  // Read the body, so the connection can be reused
  await response.arrayBuffer().catch(() => undefined);
}

/** The raw response body, e.g. for images. */
export async function sendForBlob(endpoint: Endpoint): Promise<Blob> {
  const response = await perform(endpoint);
  try {
    return await response.blob();
  } catch (error) {
    throw new ApiError("transport", { cause: error });
  }
}

// MARK: - Multipart

type FormValue = string | number | boolean | null | undefined | readonly (string | number)[];

/**
 * A multipart/form-data body (MultipartFormData.swift). Lists (also of files) are sent as repeated fields with the
 * same name, which is what FastAPI expects. Null and undefined values are left out, booleans are sent as "true" / "false".
 */
export function formData(
  fields: Record<string, FormValue>,
  files: Record<string, ImageUpload | readonly ImageUpload[] | null | undefined> = {},
): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((item) => form.append(name, String(item)));
    } else {
      form.append(name, String(value));
    }
  }
  for (const [name, value] of Object.entries(files)) {
    for (const file of Array.isArray(value) ? value : value ? [value as ImageUpload] : []) {
      form.append(name, new File([file.data], file.filename, { type: file.mimeType }));
    }
  }
  return form;
}

/** A JPEG, PNG, WebP or HEIC image to upload (ImageUpload in ExerciseDTOs.swift). See `detectImageUpload()`. */
export interface ImageUpload {
  data: Blob;
  filename: string;
  mimeType: string;
}
