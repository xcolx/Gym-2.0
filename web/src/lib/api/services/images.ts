// Port of ios/Gym 2.0/Core/Services/ImageService.swift and ImageUpload(detecting:) of ExerciseDTOs.swift. The images
// need the session cookie, which the browser sends along with same-origin requests, so `imageUrl(hash)` can be used
// directly as the src of an <img>.

import { API_BASE_PATH, sendForBlob, type ImageUpload } from "../client";

/** The URL of a stored image, null for an empty or missing hash */
export function imageUrl(hash: string | null | undefined): string | null {
  return hash ? `${API_BASE_PATH}/images/${hash}` : null;
}

const MAX_CACHE_BYTES = 50 * 1024 * 1024;
const cache = new Map<string, Blob>();
let cachedBytes = 0;

export const imageApi = {
  /**
   * The JPEG of the image, e.g. to process it (like the muscle masks on iOS). Fails with 404 if no image exists for the
   * hash. Kept in memory for the lifetime of the page.
   */
  imageData: async (hash: string): Promise<Blob> => {
    const cached = cache.get(hash);
    if (cached) return cached;
    const data = await sendForBlob({ method: "GET", path: `/images/${hash}` });
    // Oldest first out, like a simple NSCache
    while (cachedBytes + data.size > MAX_CACHE_BYTES && cache.size > 0) {
      const [oldestHash, oldest] = cache.entries().next().value as [string, Blob];
      cache.delete(oldestHash);
      cachedBytes -= oldest.size;
    }
    cache.set(hash, data);
    cachedBytes += data.size;
    return data;
  },
};

/** Detects the format from the first bytes. Null for formats the server doesn't accept (JPEG, PNG, WebP, HEIC). */
export async function detectImageUpload(data: Blob): Promise<ImageUpload | null> {
  const bytes = new Uint8Array(await data.slice(0, 12).arrayBuffer());
  return detectImageType(bytes, data);
}

/** The synchronous part of `detectImageUpload`, for the first 12 bytes */
function detectImageType(bytes: Uint8Array, data: Blob): ImageUpload | null {
  const matches = (signature: number[] | string, offset = 0) => {
    const expected = typeof signature === "string" ? Array.from(signature, (c) => c.charCodeAt(0)) : signature;
    return bytes.length >= offset + expected.length && expected.every((byte, i) => bytes[offset + i] === byte);
  };
  if (matches([0xff, 0xd8, 0xff])) return { data, filename: "image.jpg", mimeType: "image/jpeg" };
  if (matches([0x89, 0x50, 0x4e, 0x47])) return { data, filename: "image.png", mimeType: "image/png" };
  if (matches("RIFF") && matches("WEBP", 8)) return { data, filename: "image.webp", mimeType: "image/webp" };
  if (matches("ftyp", 4)) return { data, filename: "image.heic", mimeType: "image/heic" };
  return null;
}
