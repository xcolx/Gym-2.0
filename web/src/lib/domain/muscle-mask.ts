// The pixel work of MuscleMaskCache.makeMask in ios/Gym 2.0/DesignSystem/Components/HighlightedBodyView.swift

/** Large enough for the biggest highlighted body in the app */
const MUSCLE_MASK_MAX_PIXEL_SIZE = 800;

/** JPEG compression gives the white and black parts of the image a little color */
const MUSCLE_MASK_MIN_CHROMA = 24;

/** The opacity of a pixel of the mask, 0...255 */
export function maskAlpha(red: number, green: number, blue: number): number {
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  return Math.min(
    255,
    Math.trunc((Math.max(chroma - MUSCLE_MASK_MIN_CHROMA, 0) * 255) / (255 - MUSCLE_MASK_MIN_CHROMA)),
  );
}

/**
 * Turns RGBA pixels (canvas ImageData, not premultiplied) into the mask in place: white with the opacity of
 * `maskAlpha`, so it can be used as CSS mask-image. Like on iOS, which draws the image into a premultiplied context
 * first, transparent pixels (e.g. of the bundled PNGs) count as black.
 */
export function makeMuscleMask(pixels: Uint8ClampedArray): void {
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const opacity = pixels[offset + 3] / 255;
    const alpha = maskAlpha(
      Math.round(pixels[offset] * opacity),
      Math.round(pixels[offset + 1] * opacity),
      Math.round(pixels[offset + 2] * opacity),
    );
    pixels[offset] = 255;
    pixels[offset + 1] = 255;
    pixels[offset + 2] = 255;
    pixels[offset + 3] = alpha;
  }
}

/** The size to draw an image at: at most MUSCLE_MASK_MAX_PIXEL_SIZE on the longest side, never scaled up */
export function maskSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MUSCLE_MASK_MAX_PIXEL_SIZE / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
