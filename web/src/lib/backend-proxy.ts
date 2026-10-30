/** Without BACKEND_URL: the backend of `docker compose up -d db flyway backend` */
export const DEFAULT_BACKEND_URL = "http://localhost:5000";

/**
 * A request to the backend is given up after this long: a bit longer than the backend waits for the AI (90 s,
 * OLLAMA_TIMEOUT_SECONDS), and less than the 100 s after which Cloudflare gives up on gym2.app.
 */
const BACKEND_TIMEOUT_MS = 95_000;

/** The base URL of the backend without a trailing slash, read for every request so it can be set when the server starts */
export function backendUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
}

/** The backend URL for a request to /api/... (path and query), null for other paths */
export function backendTarget(pathname: string, search: string, base: string): string | null {
  if (pathname !== "/api" && !pathname.startsWith("/api/")) return null;
  return `${base}${pathname.slice("/api".length) || "/"}${search}`;
}

/**
 * How many reverse proxies in front of this server append to X-Forwarded-For and are trusted (TRUSTED_PROXY_HOPS,
 * default 0). Only the last that many entries of the header are forwarded, the ones before can be sent by anyone.
 */
export function trustedProxyHops(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.TRUSTED_PROXY_HOPS?.trim() || "0");
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/**
 * The X-Forwarded-For to send to the backend, null for none: the last `hops` entries of the incoming one (written by
 * the trusted reverse proxies). Without trusted proxies nothing: the header may come from the client, and Next.js only
 * sets it to the address of the connection when the client sent none, so the two can't be told apart.
 */
export function forwardedFor(incoming: string | null, hops: number): string | null {
  if (hops <= 0 || !incoming) return null;
  const entries = incoming
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  return entries.length > 0 ? entries.slice(-hops).join(", ") : null;
}

/**
 * Forwarding headers a client can send to pose as another address or host. They're never passed on as received:
 * X-Forwarded-Host is set from Host, X-Forwarded-For from the trusted proxies (`forwardedFor`).
 */
const CLIENT_FORWARDING = new Set(["forwarded", "x-real-ip", "x-forwarded-for", "x-forwarded-host", "x-forwarded-port", "x-forwarded-proto", "x-forwarded-prefix", "x-client-ip", "true-client-ip", "cf-connecting-ip"]);

/** Headers of the connection to this server, which aren't forwarded (RFC 9110 7.6.1) */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/**
 * Sends the request to `target` and returns the backend's response as it is: status, headers (incl. every
 * Set-Cookie) and the streamed body. Nothing of the response tells the browser where the backend is. 502 if the backend
 * can't be reached, 504 if it doesn't answer within BACKEND_TIMEOUT_MS.
 */
export async function forwardToBackend(
  request: Request,
  target: string,
  {
    fetchImpl = fetch,
    timeoutMs = BACKEND_TIMEOUT_MS,
    proxyHops = trustedProxyHops(),
  }: { fetchImpl?: typeof fetch; timeoutMs?: number; proxyHops?: number } = {},
): Promise<Response> {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    // The length is set again for the forwarded body, the host is the backend's. "Expect: 100-continue" (e.g. of curl
    // for large uploads) was answered by this server already, fetch refuses to send it.
    if (HOP_BY_HOP.has(key) || CLIENT_FORWARDING.has(key)) return;
    if (key !== "host" && key !== "content-length" && key !== "expect") headers.set(key, value);
  });
  const host = request.headers.get("host");
  if (host) headers.set("x-forwarded-host", host);
  const clientAddress = forwardedFor(request.headers.get("x-forwarded-for"), proxyHops);
  if (clientAddress) headers.set("x-forwarded-for", clientAddress);
  // The scheme the trusted proxy received the request with
  const proto = proxyHops > 0 ? request.headers.get("x-forwarded-proto") : null;
  if (proto) headers.set("x-forwarded-proto", proto);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const timeout = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(target, {
      method: request.method,
      headers,
      // Next.js buffers the body for the proxy anyway (up to proxyClientMaxBodySize)
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
      signal: AbortSignal.any([request.signal, timeout]),
    });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    const timedOut = timeout.aborted;
    console.error(`[proxy] ${request.method} ${new URL(target).pathname} failed`, error);
    return Response.json(
      { detail: timedOut ? "The server didn't answer in time." : "The server could not be reached." },
      { status: timedOut ? 504 : 502 },
    );
  }

  const responseHeaders = new Headers();
  // fetch has already decoded a compressed body
  const decoded = response.headers.has("content-encoding");
  response.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key) || key === "set-cookie") return;
    if (decoded && (key === "content-encoding" || key === "content-length")) return;
    responseHeaders.set(key, value);
  });
  for (const cookie of response.headers.getSetCookie()) responseHeaders.append("set-cookie", cookie);

  // A response without a body can't be built with one
  const body = response.status === 204 || response.status === 304 || request.method === "HEAD" ? null : response.body;
  return new Response(body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
}
