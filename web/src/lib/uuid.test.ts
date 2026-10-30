import { afterEach, describe, expect, it, vi } from "vitest";

import { newUUID } from "./uuid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe("newUUID", () => {
  it("is a random version 4 UUID", () => {
    const uuid = newUUID();
    expect(uuid).toMatch(V4);
    expect(newUUID()).not.toBe(uuid);
  });

  it("is one also outside secure contexts, without crypto.randomUUID", () => {
    const getRandomValues = (bytes: Uint8Array) => bytes.fill(0xff);
    vi.stubGlobal("crypto", { getRandomValues });
    expect(newUUID()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(0) });
    expect(newUUID()).toBe("00000000-0000-4000-8000-000000000000");
  });

  it("uses random bytes outside secure contexts", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => real.getRandomValues(bytes) });
    const uuids = new Set(Array.from({ length: 50 }, () => newUUID()));
    expect(uuids.size).toBe(50);
    for (const uuid of uuids) expect(uuid).toMatch(V4);
  });
});
