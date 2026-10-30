// The uploads of the chat images, like ChatView.photoUpload(from:) and GroupImagePicker.upload(for:): decoded in the
// browser (upright, from the EXIF orientation), scaled down to the size the server stores and sent as JPEG.

import type { ImageUpload } from "@/lib/api";
import {
  MAX_GROUP_IMAGE_SIDE,
  MAX_PHOTO_DIMENSION,
  UPLOAD_JPEG_QUALITY,
  centeredSquare,
  scaledToFit,
} from "@/lib/domain/image-size";

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void };

async function decode(file: Blob): Promise<Decoded | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // e.g. an older browser without the options, try the <img> below
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => {} };
  } catch {
    // Not an image the browser can decode (e.g. HEIC outside Safari)
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toJpeg(canvas: HTMLCanvasElement): Promise<ImageUpload | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ? { data: blob, filename: "image.jpg", mimeType: "image/jpeg" } : null),
      "image/jpeg",
      UPLOAD_JPEG_QUALITY,
    );
  });
}

/** A chat photo: at most 2048 px on the longest side. Null if the file isn't an image the browser can read. */
export async function photoUpload(file: Blob): Promise<ImageUpload | null> {
  const image = await decode(file);
  if (!image) return null;
  try {
    const size = scaledToFit(image.width, image.height, MAX_PHOTO_DIMENSION);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image.source, 0, 0, size.width, size.height);
    return await toJpeg(canvas);
  } finally {
    image.close();
  }
}

/** A group image: the centered square of at most 1024 px. Null if the file isn't an image the browser can read. */
export async function groupImageUpload(file: Blob): Promise<ImageUpload | null> {
  const image = await decode(file);
  if (!image) return null;
  try {
    const square = centeredSquare(image.width, image.height, MAX_GROUP_IMAGE_SIDE);
    const canvas = document.createElement("canvas");
    canvas.width = square.side;
    canvas.height = square.side;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image.source, square.sourceX, square.sourceY, square.sourceSide, square.sourceSide, 0, 0, square.side, square.side);
    return await toJpeg(canvas);
  } finally {
    image.close();
  }
}
