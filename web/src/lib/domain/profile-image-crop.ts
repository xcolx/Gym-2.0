// The geometry of ios/Gym 2.0/Features/Settings/ProfileImageCropView.swift

export interface Size {
  width: number;
  height: number;
}

export interface Offset {
  x: number;
  y: number;
}

interface CropRect {
  x: number;
  y: number;
  side: number;
}

export const MAX_ZOOM = 4;
/** Side length of the cropped image, the server doesn't store larger profile images */
const OUTPUT_SIZE = 1024;

/** At zoom 1 the shorter side of the image fills the circle */
export function displayedSize(image: Size, diameter: number, zoom: number): Size {
  const fill = diameter / Math.min(image.width, image.height);
  return { width: image.width * fill * zoom, height: image.height * fill * zoom };
}

export function clampZoom(zoom: number): number {
  return Math.min(Math.max(zoom, 1), MAX_ZOOM);
}

/** So that the image never leaves a gap inside the circle */
export function clampOffset(offset: Offset, image: Size, diameter: number, zoom: number): Offset {
  const size = displayedSize(image, diameter, zoom);
  const maxX = (size.width - diameter) / 2;
  const maxY = (size.height - diameter) / 2;
  return { x: Math.min(Math.max(offset.x, -maxX), maxX), y: Math.min(Math.max(offset.y, -maxY), maxY) };
}

/** The square of the image (in image pixels) behind the circle */
export function cropRect(image: Size, diameter: number, zoom: number, offset: Offset): CropRect {
  const size = displayedSize(image, diameter, zoom);
  // Image pixels per displayed pixel
  const factor = image.width / size.width;
  return {
    x: ((size.width - diameter) / 2 - offset.x) * factor,
    y: ((size.height - diameter) / 2 - offset.y) * factor,
    side: diameter * factor,
  };
}

/** The side length of the output image: the cropped square, at most OUTPUT_SIZE */
export function outputSide(rect: CropRect): number {
  return Math.max(1, Math.round(Math.min(rect.side, OUTPUT_SIZE)));
}
