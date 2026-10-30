import { afterEach, describe, expect, it, vi } from "vitest";

import { appUpdateStore } from "./app-update";
import { formData, onUnauthorized, send, sendVoid } from "./client";
import { ApiError } from "./errors";

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(body === null ? null : JSON.stringify(body), { status, headers }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  appUpdateStore.set({ isUpdateRequired: false, showsUpdateNotice: false });
});

describe("send", () => {
  it("sends JSON with snake_case keys to the proxied API path and decodes camelCase", async () => {
    const fetchMock = respond(200, { sync_time: "t", workouts: [{ in_progress: true }] });
    const result = await send<{ syncTime: string; workouts: { inProgress: boolean }[] }>({
      method: "POST",
      path: "/workouts/create",
      json: { clientUuid: "u", duration: 5 },
    });
    expect(result).toEqual({ syncTime: "t", workouts: [{ inProgress: true }] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/workouts/create");
    expect(init?.credentials).toBe("include");
    expect(init?.body).toBe('{"client_uuid":"u","duration":5}');
  });

  it("encodes the query, also the + of time zones", async () => {
    const fetchMock = respond(200, {});
    await send({ method: "GET", path: "/workouts/delta", query: { last_sync_time: "2026-10-15T08:00:00+00:00", x: null } });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/workouts/delta?last_sync_time=2026-10-15T08%3A00%3A00%2B00%3A00");
  });

  it("accepts empty responses", async () => {
    respond(204, null);
    await expect(sendVoid({ method: "DELETE", path: "/workouts/delete/1" })).resolves.toBeUndefined();
  });

  it("throws server errors with the code of the backend", async () => {
    respond(404, { error: "WorkoutNotFoundError", detail: "Workout not found." });
    const error = await send({ method: "GET", path: "/x" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: "server", status: 404, code: "WorkoutNotFoundError", message: "Workout not found." });
  });

  it("reports 401 to the listeners", async () => {
    const listener = vi.fn();
    const stop = onUnauthorized(listener);
    respond(401, { detail: "Session expired or invalid token." });
    await expect(send({ method: "GET", path: "/users/me" })).rejects.toMatchObject({ kind: "unauthorized" });
    expect(listener).toHaveBeenCalledWith("/users/me");
    stop();
  });

  it("requires an update for 410 and offers one for a Deprecation header", async () => {
    respond(200, {}, { Deprecation: "true" });
    await send({ method: "GET", path: "/health" });
    expect(appUpdateStore.get().showsUpdateNotice).toBe(true);

    respond(410, { error: "ApiVersionRetiredError", detail: "Update" });
    await expect(send({ method: "GET", path: "/health" })).rejects.toMatchObject({ kind: "updateRequired", status: 410 });
    expect(appUpdateStore.get().isUpdateRequired).toBe(true);
  });

  it("turns network failures into transport errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(send({ method: "GET", path: "/health" })).rejects.toMatchObject({ kind: "transport" });
  });
});

describe("formData", () => {
  it("repeats lists and leaves out nulls", () => {
    const form = formData({ name: "Squat", aliases: ["A", "B"], description: null, reps: true });
    expect(form.getAll("aliases")).toEqual(["A", "B"]);
    expect(form.has("description")).toBe(false);
    expect(form.get("reps")).toBe("true");
  });
});
