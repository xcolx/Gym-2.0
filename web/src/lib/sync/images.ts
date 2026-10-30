import type { GymDB } from "@/lib/db";
import { pruneImageCache, referencedImageHashes } from "@/lib/pwa/image-cache";
import { logSync } from "./log";

/** Whether two images are the same (`Data ==` in Swift). Not a Dexie call: never inside a transaction. */
export async function sameImage(a: Blob, b: Blob): Promise<boolean> {
  if (a === b) return true;
  if (a.size !== b.size || a.type !== b.type) return false;
  const [bytesA, bytesB] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  const viewA = new Uint8Array(bytesA);
  const viewB = new Uint8Array(bytesB);
  return viewA.every((byte, i) => byte === viewB[i]);
}

/** Whether `images` starts with the images of `prefix`. Not a Dexie call: never inside a transaction. */
export async function startsWithImages(images: readonly Blob[], prefix: readonly Blob[]): Promise<boolean> {
  if (images.length < prefix.length) return false;
  for (const [i, image] of prefix.entries()) {
    if (!(await sameImage(images[i], image))) return false;
  }
  return true;
}

/** A cheap fingerprint of the images, to notice inside a transaction that they were changed */
export const imagesSignature = (images: readonly Blob[] | undefined) =>
  (images ?? []).map((image) => `${image.size}:${image.type}`).join(",");

/** Removes the cached images the pulled data doesn't reference anymore. A failure doesn't fail the sync. */
export async function pruneImages(db: GymDB): Promise<void> {
  try {
    await pruneImageCache(await referencedImageHashes(db));
  } catch (error) {
    logSync.error("Pruning the image cache failed", error);
  }
}
