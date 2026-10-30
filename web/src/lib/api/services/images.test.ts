import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { detectImageUpload, imageApi, imageUrl } from "./images";

const blob = (...bytes: number[]) => new Blob([new Uint8Array(bytes)]);
const ascii = (text: string) => Array.from(text, (character) => character.charCodeAt(0));

describe("imageUrl", () => {
  it("is the API path of the hash, null without one", () => {
    expect(imageUrl("abc")).toBe("/api/v1/images/abc");
    expect(imageUrl("")).toBeNull();
    expect(imageUrl(null)).toBeNull();
    expect(imageUrl(undefined)).toBeNull();
  });
});

describe("detectImageUpload", () => {
  it("detects the formats the server accepts by their first bytes", async () => {
    expect(await detectImageUpload(blob(0xff, 0xd8, 0xff, 0xe0))).toMatchObject({ filename: "image.jpg", mimeType: "image/jpeg" });
    expect(await detectImageUpload(blob(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a))).toMatchObject({ mimeType: "image/png" });
    expect(await detectImageUpload(blob(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")))).toMatchObject({ mimeType: "image/webp" });
    expect(await detectImageUpload(blob(0, 0, 0, 0x18, ...ascii("ftypheic")))).toMatchObject({ filename: "image.heic", mimeType: "image/heic" });
  });

  it("keeps the data", async () => {
    const data = blob(0xff, 0xd8, 0xff);
    expect((await detectImageUpload(data))?.data).toBe(data);
  });

  it("is null for other formats and too short data", async () => {
    expect(await detectImageUpload(blob(...ascii("GIF89a")))).toBeNull();
    expect(await detectImageUpload(blob(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE")))).toBeNull();
    expect(await detectImageUpload(blob(0xff, 0xd8))).toBeNull();
    expect(await detectImageUpload(blob())).toBeNull();
  });
});

describe("imageApi.imageData", () => {
  let fetchMock: ReturnType<typeof vi.fn<(url: string) => Promise<Response>>>;

  beforeEach(() => {
    fetchMock = vi.fn(async (url: string) => new Response(new Blob([`data of ${url}`]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("loads an image once per page", async () => {
    const first = await imageApi.imageData("cached-hash");
    const second = await imageApi.imageData("cached-hash");
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/images/cached-hash");
  });

  it("doesn't keep a failed request", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Not found" }), { status: 404 }));
    await expect(imageApi.imageData("missing-hash")).rejects.toMatchObject({ status: 404 });
    await imageApi.imageData("missing-hash");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("removes the oldest images beyond 50 MB", async () => {
    const big = () => new Response(new Blob([new Uint8Array(20 * 1024 * 1024)]), { status: 200 });
    fetchMock.mockImplementation(async () => big());
    for (const hash of ["big-1", "big-2", "big-3"]) await imageApi.imageData(hash);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // big-1 was removed for big-3, big-2 and big-3 are kept
    await imageApi.imageData("big-3");
    await imageApi.imageData("big-2");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await imageApi.imageData("big-1");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
