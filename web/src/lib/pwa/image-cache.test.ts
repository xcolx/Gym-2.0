import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { deleteUserDb, openUserDb } from "@/lib/db";
import { makeExercise } from "@/test/fixtures";
import type { User } from "@/types/models";
import * as routes from "../../../scripts/sw/routes.mjs";
import {
  CACHED_AT_HEADER,
  IMAGE_CACHE,
  imageHashOfUrl,
  pruneImageCache,
  referencedImageHashes,
  UNREFERENCED_IMAGE_LIFETIME_MS,
} from "./image-cache";

const USER_ID = 7;
const hash = (character: string) => character.repeat(64);

afterEach(async () => {
  vi.unstubAllGlobals();
  await deleteUserDb(USER_ID);
});

describe("image cache", () => {
  it("uses the names of the service worker", () => {
    expect(IMAGE_CACHE).toBe(routes.IMAGE_CACHE);
    expect(CACHED_AT_HEADER).toBe(routes.CACHED_AT_HEADER);
  });

  it("finds the hash of an image URL like the service worker", () => {
    const path = `/api/v1/images/${hash("a")}`;
    expect(routes.imageHashOf(path)).toBe(hash("a"));
    expect(imageHashOfUrl(`https://gym2.app${path}`)).toBe(hash("a"));
    expect(routes.imageHashOf("/api/v1/images/abc")).toBeNull();
    expect(routes.imageHashOf(`/api/v1/users/${hash("a")}`)).toBeNull();
    expect(imageHashOfUrl("https://gym2.app/images/gym-ai.jpg")).toBeNull();
  });

  it("collects the images of the stored exercises, users, chats, messages and muscles", async () => {
    const db = (await openUserDb(USER_ID))!;
    await db.exercises.put(makeExercise({ imageUrls: [hash("1"), hash("2")] }));
    await db.users.put({ serverId: 1, profileImageUrl: hash("3"), profileIconUrl: "" } as User);
    await db.chats.put({ serverId: 1, imageUrl: hash("4") } as never);
    await db.messages.put({ serverId: 1, chatId: 1, imageUrl: hash("5") } as never);
    await db.muscles.put({ serverId: 1, name: "Chest", imageUrl: hash("6") });
    expect(await referencedImageHashes(db)).toEqual(new Set(["1", "2", "3", "4", "5", "6"].map(hash)));
  });

  it("removes the unreferenced images once they're older than the lifetime", async () => {
    const now = 1_000_000_000_000;
    const entries = new Map<string, Response>();
    const put = (character: string, cachedAt: number) =>
      entries.set(
        `https://gym2.app/api/v1/images/${hash(character)}`,
        new Response("", { headers: { [CACHED_AT_HEADER]: String(cachedAt) } }),
      );
    put("a", now - UNREFERENCED_IMAGE_LIFETIME_MS - 1); // referenced, kept
    put("b", now - UNREFERENCED_IMAGE_LIFETIME_MS - 1); // unreferenced and old, removed
    put("c", now - 1000); // unreferenced but new, kept
    entries.set(`https://gym2.app/api/v1/images/${hash("d")}`, new Response("")); // without the date, removed
    const cache = {
      keys: async () => [...entries.keys()].map((url) => new Request(url)),
      match: async (request: Request) => entries.get(request.url),
      delete: async (request: Request) => entries.delete(request.url),
    };
    vi.stubGlobal("caches", { has: async () => true, open: async () => cache });

    await pruneImageCache(new Set([hash("a")]), now);
    expect([...entries.keys()].map((url) => url.slice(-64))).toEqual([hash("a"), hash("c")]);
  });
});
