// The cache of the stored images, filled by the service worker (scripts/sw/worker.js). This module removes the images
// nothing references anymore and clears the cache on logout. Without a service worker (`next dev`) it does nothing.

import type { GymDB } from "@/lib/db";

/** Same name as IMAGE_CACHE in scripts/sw/routes.mjs, which the worker uses */
export const IMAGE_CACHE = "gym2-images";

/** Same header as CACHED_AT_HEADER in scripts/sw/routes.mjs: when the worker cached the image (milliseconds) */
export const CACHED_AT_HEADER = "x-gym2-cached-at";

/**
 * Images that aren't referenced (anymore) are kept this long after they were cached, e.g. the images of the public
 * groups or of the senders of friend requests, which aren't stored
 */
export const UNREFERENCED_IMAGE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/** The hash of a cached image by its URL (/api/v1/images/<hash>), like imageHashOf of scripts/sw/routes.mjs */
export function imageHashOfUrl(url: string): string | null {
  const match = /^\/api\/v\d+\/images\/([0-9a-f]{64})$/.exec(new URL(url, "http://localhost").pathname);
  return match ? match[1] : null;
}

/** The hashes of all images the stored data shows: exercises, users, chats, messages and muscles */
export async function referencedImageHashes(db: GymDB): Promise<Set<string>> {
  const hashes = new Set<string>();
  const [exercises, users, chats, messages, muscles] = await Promise.all([
    db.exercises.toArray(),
    db.users.toArray(),
    db.chats.toArray(),
    db.messages.toArray(),
    db.muscles.toArray(),
  ]);
  for (const exercise of exercises) exercise.imageUrls.forEach((hash) => hashes.add(hash));
  for (const user of users) [user.profileImageUrl, user.profileIconUrl].forEach((hash) => hashes.add(hash));
  for (const chat of chats) if (chat.imageUrl) hashes.add(chat.imageUrl);
  for (const message of messages) if (message.imageUrl) hashes.add(message.imageUrl);
  for (const muscle of muscles) hashes.add(muscle.imageUrl);
  hashes.delete("");
  return hashes;
}

/** Removes the cached images that aren't in `referenced` and were cached more than UNREFERENCED_IMAGE_LIFETIME_MS ago */
export async function pruneImageCache(referenced: ReadonlySet<string>, now: number = Date.now()): Promise<void> {
  if (typeof caches === "undefined" || !(await caches.has(IMAGE_CACHE))) return;
  const cache = await caches.open(IMAGE_CACHE);
  for (const request of await cache.keys()) {
    const hash = imageHashOfUrl(request.url);
    if (hash && referenced.has(hash)) continue;
    const cachedAt = Number((await cache.match(request))?.headers.get(CACHED_AT_HEADER));
    if (Number.isFinite(cachedAt) && cachedAt > 0 && now - cachedAt < UNREFERENCED_IMAGE_LIFETIME_MS) continue;
    await cache.delete(request);
  }
}

/** Removes all cached images, e.g. after a logout */
export async function clearImageCache(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    await caches.delete(IMAGE_CACHE);
  } catch (error) {
    console.error("Clearing the image cache failed", error);
  }
}
