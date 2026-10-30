import { describe, expect, it } from "vitest";

import { keysToCamelCase, keysToSnakeCase } from "./case";
import { ApiError, isRejection, parseErrorBody } from "./errors";

describe("key conversion", () => {
  it("converts responses to camelCase", () => {
    expect(keysToCamelCase({ client_uuid: "x", members: [{ user_id: 1, last_read_message_id: 2 }], public: true })).toEqual({
      clientUuid: "x",
      members: [{ userId: 1, lastReadMessageId: 2 }],
      public: true,
    });
  });

  it("converts requests to snake_case and leaves out nulls like Swift's Encodable", () => {
    const date = new Date(Date.UTC(2026, 9, 15, 8, 30));
    expect(
      keysToSnakeCase({ clientUuid: "x", inProgress: false, reps: null, name: undefined, date, exercises: [{ exerciseId: 1 }] }),
    ).toEqual({ client_uuid: "x", in_progress: false, date: "2026-10-15T08:30:00.000Z", exercises: [{ exercise_id: 1 }] });
  });
});

describe("error bodies", () => {
  it("reads app errors, HTTP exceptions, validation errors and rate limits", () => {
    expect(parseErrorBody({ error: "EmailVerificationError", detail: "Verify first" })).toEqual({
      message: "Verify first",
      code: "EmailVerificationError",
    });
    expect(parseErrorBody({ detail: "Not authenticated" })).toEqual({ message: "Not authenticated", code: null });
    expect(parseErrorBody({ detail: [{ msg: "Value error, Bad name" }, { msg: "Too long" }] })).toEqual({
      message: "Bad name\nToo long",
      code: null,
    });
    expect(parseErrorBody({ error: "Rate limit exceeded: 5 per 1 minute" })).toEqual({
      message: "Rate limit exceeded: 5 per 1 minute",
      code: null,
    });
    expect(parseErrorBody("<html>")).toEqual({ message: null, code: null });
  });

  it("treats 4xx except timeouts and rate limits as rejections", () => {
    expect(isRejection(new ApiError("server", { status: 400 }))).toBe(true);
    expect(isRejection(new ApiError("server", { status: 404 }))).toBe(true);
    expect(isRejection(new ApiError("server", { status: 408 }))).toBe(false);
    expect(isRejection(new ApiError("server", { status: 429 }))).toBe(false);
    expect(isRejection(new ApiError("server", { status: 500 }))).toBe(false);
    expect(isRejection(new ApiError("transport"))).toBe(false);
    expect(isRejection(new ApiError("updateRequired"))).toBe(false);
    expect(new ApiError("updateRequired").status).toBe(410);
  });
});
