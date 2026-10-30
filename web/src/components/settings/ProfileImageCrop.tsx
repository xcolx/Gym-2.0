"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";

import {
  clampOffset,
  clampZoom,
  cropRect,
  displayedSize,
  outputSide,
  type Offset,
  type Size,
} from "@/lib/domain/profile-image-crop";

/** JPEG quality of the cropped image, like `jpegData(compressionQuality: 0.85)` */
const JPEG_QUALITY = 0.85;

/**
 * Port of ProfileImageCropView.swift: "Choose" returns the square behind the circle as JPEG of at most 1024 pixels.
 */
export function ProfileImageCrop({
  image,
  onCancel,
  onChoose,
}: {
  image: HTMLImageElement;
  onCancel: () => void;
  onChoose: (jpeg: Blob) => void;
}) {
  const imageSize: Size = { width: image.naturalWidth, height: image.naturalHeight };
  const area = useRef<HTMLDivElement>(null);
  const [areaSize, setAreaSize] = useState<Size>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  // The pointers on the image, for dragging with one and pinching with two
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ zoom: number; offset: Offset; distance: number; center: { x: number; y: number } } | null>(null);

  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setAreaSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const diameter = Math.max(0, Math.min(areaSize.width, areaSize.height) - 32);
  const size = displayedSize(imageSize, diameter || 1, zoom);

  const startGesture = () => {
    const points = [...pointers.current.values()];
    const center = points.reduce((sum, p) => ({ x: sum.x + p.x / points.length, y: sum.y + p.y / points.length }), { x: 0, y: 0 });
    const distance = points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
    gesture.current = { zoom, offset, distance, center };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    startGesture();
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    const start = gesture.current;
    const center = points.reduce((sum, p) => ({ x: sum.x + p.x / points.length, y: sum.y + p.y / points.length }), { x: 0, y: 0 });
    const nextZoom =
      points.length > 1 && start.distance > 0
        ? clampZoom(start.zoom * (Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) / start.distance))
        : start.zoom;
    const proposed = { x: start.offset.x + center.x - start.center.x, y: start.offset.y + center.y - start.center.y };
    setZoom(nextZoom);
    setOffset(clampOffset(proposed, imageSize, diameter, nextZoom));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size > 0) startGesture();
    else gesture.current = null;
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    const nextZoom = clampZoom(zoom * Math.exp(-event.deltaY / 300));
    setZoom(nextZoom);
    setOffset((current) => clampOffset(current, imageSize, diameter, nextZoom));
  };

  const choose = () => {
    if (diameter <= 0) return;
    const rect = cropRect(imageSize, diameter, zoom, offset);
    const side = outputSide(rect);
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const context = canvas.getContext("2d");
    if (!context) return;
    // Draws the whole image shifted and scaled, like ProfileImageCropView.crop
    const scale = side / rect.side;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, -rect.x * scale, -rect.y * scale, imageSize.width * scale, imageSize.height * scale);
    canvas.toBlob((blob) => blob && onChoose(blob), "image/jpeg", JPEG_QUALITY);
  };

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Move and Scale">
      <header className="shrink-0 bg-[#161616] pt-[env(safe-area-inset-top)]">
        <div className="relative flex h-11 items-center justify-between px-4">
          <button type="button" onClick={onCancel} className="text-body text-app active:opacity-50">
            Cancel
          </button>
          <h1 className="absolute inset-x-24 text-center text-headline font-semibold">Move and Scale</h1>
          <button type="button" onClick={choose} className="text-body font-semibold text-app active:opacity-50">
            Choose
          </button>
        </div>
      </header>
      <div
        ref={area}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {diameter > 0 && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{
                width: size.width,
                height: size.height,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
            />
            {/* Everything but the circle grayed out, with a thin white ring */}
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 rounded-full border border-white/80"
              style={{
                width: diameter,
                height: diameter,
                transform: "translate(-50%, -50%)",
                boxShadow: "0 0 0 100vmax rgba(0, 0, 0, 0.6)",
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** Loads a picked file as an image, null if the browser can't decode it (e.g. HEIC outside of Safari) */
export function loadImage(file: Blob): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth > 0 ? image : null);
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}
