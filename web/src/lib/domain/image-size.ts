// Like ChatView.photoUpload(from:) and GroupImagePicker.upload(for:): the server stores photos at 2048 px and group
// images at 1024 px, so bigger images would only take longer to upload.

/** The longest side of a chat photo */
export const MAX_PHOTO_DIMENSION = 2048;
/** The side of the square group image */
export const MAX_GROUP_IMAGE_SIDE = 1024;
/** The JPEG quality of both */
export const UPLOAD_JPEG_QUALITY = 0.85;

/** Scaled down (never up) so that the longest side is at most `maxDimension`, in whole pixels */
export function scaledToFit(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * The centered square of the image (the source rectangle) and the side it's drawn at: the shorter side, at most
 * `maxSide`. The image fills the square, the longer side is cut off evenly.
 */
export function centeredSquare(
  width: number,
  height: number,
  maxSide: number,
): { sourceX: number; sourceY: number; sourceSide: number; side: number } {
  const sourceSide = Math.min(width, height);
  return {
    sourceX: (width - sourceSide) / 2,
    sourceY: (height - sourceSide) / 2,
    sourceSide,
    side: Math.max(1, Math.round(Math.min(sourceSide, maxSide))),
  };
}
