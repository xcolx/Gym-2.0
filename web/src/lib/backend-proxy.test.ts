import { describe, expect, it, vi } from "vitest";

import { backendTarget, backendUrl, DEFAULT_BACKEND_URL, forwardedFor, forwardToBackend, trustedProxyHops } from "./backend-proxy";

describe("backendUrl", () => {
  it("reads BACKEND_URL without trailing slashes", () => {
    expect(backendUrl({ BACKEND_URL: "http://backend:5000//" })).toBe("http://backend:5000");
  });

  it("falls back to the local backend", () => {
    expect(backendUrl({})).toBe(DEFAULT_BACKEND_URL);
    expect(backendUrl({ BACKEND_URL: "" })).toBe(DEFAULT_BACKEND_URL);
  });
});

describe("backendTarget", () => {
  const base = "http://backend:5000";

  it("strips /api and keeps the path and query", () => {
    expect(backendTarget("/api/v1/users/me", "", base)).toBe("http://backend:5000/v1/users/me");
    expect(backendTarget("/api/v1/workouts/changes", "?since=2026-10-15T10%3A00%3A00%2B00%3A00", base)).toBe(
      "http://backend:5000/v1/workouts/changes?since=2026-10-15T10%3A00%3A00%2B00%3A00",
    );
    expect(backendTarget("/api/health", "", base)).toBe("http://backend:5000/health");
    expect(backendTarget("/api", "", base)).toBe("http://backend:5000/");
  });

  it("ignores other paths", () => {
    expect(backendTarget("/apiary", "", base)).toBeNull();
    expect(backendTarget("/home", "", base)).toBeNull();
  });
});

describe("forwardToBackend", () => {
  const target = "http://backend:5000/v1/users/me";

  it("forwards method, headers and body and returns the backend's response with every cookie", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers({ "content-type": "application/json" });
      headers.append("set-cookie", "session=abc; HttpOnly; Path=/");
      headers.append("set-cookie", "other=1; Path=/");
      return new Response(JSON.stringify({ echoed: new TextDecoder().decode(init?.body as ArrayBuffer) }), {
        status: 201,
        headers,
      });
    });
    const request = new Request("http://smoke.localhost:3106/api/v1/users/me", {
      method: "POST",
      headers: { cookie: "session=old", "content-type": "application/json", host: "smoke.localhost:3106", expect: "100-continue" },
      body: JSON.stringify({ name: "Fly" }),
    });

    const response = await forwardToBackend(request, target, { fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(target);
    expect(init?.method).toBe("POST");
    const sent = new Headers(init?.headers);
    expect(sent.get("cookie")).toBe("session=old");
    expect(sent.get("x-forwarded-host")).toBe("smoke.localhost:3106");
    expect(sent.has("host")).toBe(false);
    expect(sent.has("expect")).toBe(false);
    expect(response.status).toBe(201);
    expect(response.headers.getSetCookie()).toEqual(["session=abc; HttpOnly; Path=/", "other=1; Path=/"]);
    expect(await response.json()).toEqual({ echoed: JSON.stringify({ name: "Fly" }) });
    expect([...response.headers.keys()].some((key) => key.startsWith("x-middleware"))).toBe(false);
  });

  it("answers 502 if the backend can't be reached and 504 if it doesn't answer in time", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const unreachable = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const response = await forwardToBackend(new Request("http://localhost/api/v1/users/me"), target, { fetchImpl: unreachable });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ detail: "The server could not be reached." });

    const hanging = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))),
    );
    const late = await forwardToBackend(new Request("http://localhost/api/v1/users/me"), target, { fetchImpl: hanging, timeoutMs: 10 });
    expect(late.status).toBe(504);
    vi.restoreAllMocks();
  });

  it("keeps a response without body empty", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const response = await forwardToBackend(new Request("http://localhost/api/v1/x", { method: "DELETE" }), target, { fetchImpl });
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });
});

describe("forwarding headers", () => {
  const target = "http://backend:5000/v1/auth/login/email";
  const spoofed = {
    host: "gym2.app",
    "x-forwarded-for": "6.6.6.6, 203.0.113.7",
    "x-real-ip": "6.6.6.6",
    forwarded: "for=6.6.6.6",
    "x-forwarded-host": "evil.example",
    "x-forwarded-proto": "https",
    "x-forwarded-port": "443",
  };

  const sentHeaders = async (proxyHops: number, headers: Record<string, string> = spoofed) => {
    const fetchImpl = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(
      async () => new Response(null, { status: 204 }),
    );
    await forwardToBackend(new Request("http://gym2.app/api/v1/auth/login/email", { headers }), target, { fetchImpl, proxyHops });
    return new Headers(fetchImpl.mock.calls[0][1]?.headers);
  };

  it("never forwards the forwarding headers a client sent without trusted proxies", async () => {
    const sent = await sentHeaders(0);
    expect(sent.get("x-forwarded-for")).toBeNull();
    expect(sent.get("x-real-ip")).toBeNull();
    expect(sent.get("forwarded")).toBeNull();
    expect(sent.get("x-forwarded-proto")).toBeNull();
    expect(sent.get("x-forwarded-port")).toBeNull();
    expect(sent.get("x-forwarded-host")).toBe("gym2.app");
  });

  it("forwards only the addresses the trusted proxies appended", async () => {
    const sent = await sentHeaders(1);
    expect(sent.get("x-forwarded-for")).toBe("203.0.113.7");
    expect(sent.get("x-forwarded-proto")).toBe("https");
    expect(sent.get("x-real-ip")).toBeNull();
    expect(sent.get("forwarded")).toBeNull();
    expect(sent.get("x-forwarded-host")).toBe("gym2.app");
    expect((await sentHeaders(2)).get("x-forwarded-for")).toBe("6.6.6.6, 203.0.113.7");
  });

  it("keeps the last entries of X-Forwarded-For", () => {
    expect(forwardedFor("1.1.1.1, 2.2.2.2 ,3.3.3.3", 2)).toBe("2.2.2.2, 3.3.3.3");
    expect(forwardedFor("1.1.1.1", 3)).toBe("1.1.1.1");
    expect(forwardedFor("1.1.1.1", 0)).toBeNull();
    expect(forwardedFor(null, 1)).toBeNull();
    expect(forwardedFor(" , ", 1)).toBeNull();
  });

  it("reads TRUSTED_PROXY_HOPS, 0 by default and for invalid values", () => {
    expect(trustedProxyHops({})).toBe(0);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "1" })).toBe(1);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: " 2 " })).toBe(2);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "-1" })).toBe(0);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "yes" })).toBe(0);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "1.5" })).toBe(0);
  });
});
