"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle } from "lucide-react";

import { modalRef, useBackToClose, useBodyScrollLock, useEscape } from "@/components/ui/overlay";
import { imageUrl } from "@/lib/api";

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 3;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_DISTANCE = 30;

/**
 * Port of `opensPhotoViewer(hash:)` of PhotoViewer.swift: opens the image with the hash in the full screen photo viewer
 * when tapped. Without an image only the content is shown. Stops the tap from reaching a row the content is in.
 */
export function OpensPhotoViewer({
  hash,
  children,
  className = "",
  label = "Photo",
}: {
  hash: string | null | undefined;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  const [isShown, setIsShown] = useState(false);
  if (!hash) return <>{children}</>;
  return (
    <>
      <button
        type="button"
        aria-label={label}
        className={`relative z-10 shrink-0 rounded-full active:opacity-70 ${className}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsShown(true);
        }}
      >
        {children}
      </button>
      {isShown && <PhotoViewer hash={hash} onClose={() => setIsShown(false)} />}
    </>
  );
}

interface Transform {
  scale: number;
  x: number;
  y: number;
}

const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };

/** Port of PhotoViewer.swift: a photo in full screen, zoomable with a pinch or a double tap */
export function PhotoViewer({ hash, onClose }: { hash: string; onClose: () => void }) {
  const src = imageUrl(hash);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const [animated, setAnimated] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  // The current transform for the event handlers, changed together with the state
  const transformRef = useRef(transform);
  const applyTransform = (next: Transform) => {
    transformRef.current = next;
    setTransform(next);
  };

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    start: Transform;
    /** Pinch: the distance and middle at the start, relative to the center */
    distance?: number;
    middle?: { x: number; y: number };
    /** Pan: the pointer position at the start */
    point?: { x: number; y: number };
  } | null>(null);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);

  // A `.fullScreenCover`: closed with "Done", Escape and the back button of Android
  useBodyScrollLock(true);
  useBackToClose(true, onClose);
  useEscape(true, onClose);

  /** Keeps the zoomed image inside the screen, like the content inset of the UIScrollView */
  const clamped = useCallback((next: Transform): Transform => {
    const container = containerRef.current;
    const image = imageRef.current;
    const scale = Math.min(MAX_SCALE, Math.max(1, next.scale));
    if (!container || !image || scale === 1) return { scale, x: 0, y: 0 };
    const width = image.offsetWidth * scale;
    const height = image.offsetHeight * scale;
    const maxX = Math.max(0, (width - container.clientWidth) / 2);
    const maxY = Math.max(0, (height - container.clientHeight) / 2);
    return { scale, x: Math.min(maxX, Math.max(-maxX, next.x)), y: Math.min(maxY, Math.max(-maxY, next.y)) };
  }, []);

  /** A point of the event relative to the center of the screen */
  const relative = (x: number, y: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: x - rect.left - rect.width / 2, y: y - rect.top - rect.height / 2 };
  };

  const startGesture = () => {
    const points = [...pointers.current.values()];
    const start = transformRef.current;
    if (points.length >= 2) {
      const [a, b] = points;
      gesture.current = {
        start,
        distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        middle: relative((a.x + b.x) / 2, (a.y + b.y) / 2),
      };
    } else if (points.length === 1) {
      gesture.current = { start, point: points[0] };
    } else {
      gesture.current = null;
    }
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (!loaded) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setAnimated(false);
    startGesture();
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const current = gesture.current;
    if (!current) return;
    const points = [...pointers.current.values()];
    if (points.length >= 2 && current.distance && current.middle) {
      const [a, b] = points;
      const scale = Math.min(MAX_SCALE, Math.max(1, (current.start.scale * Math.hypot(a.x - b.x, a.y - b.y)) / current.distance));
      const middle = relative((a.x + b.x) / 2, (a.y + b.y) / 2);
      // The point of the image under the fingers at the start stays under them
      const contentX = (current.middle.x - current.start.x) / current.start.scale;
      const contentY = (current.middle.y - current.start.y) / current.start.scale;
      applyTransform(clamped({ scale, x: middle.x - contentX * scale, y: middle.y - contentY * scale }));
    } else if (points.length === 1 && current.point && current.start.scale > 1) {
      applyTransform(
        clamped({
          scale: current.start.scale,
          x: current.start.x + points[0].x - current.point.x,
          y: current.start.y + points[0].y - current.point.y,
        }),
      );
    }
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const wasTap =
      pointers.current.size === 1 &&
      gesture.current?.point &&
      Math.hypot(event.clientX - gesture.current.point.x, event.clientY - gesture.current.point.y) < 10;
    pointers.current.delete(event.pointerId);
    startGesture();
    if (!wasTap) return;

    const now = Date.now();
    const previous = lastTap.current;
    if (
      previous &&
      now - previous.time < DOUBLE_TAP_MS &&
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < DOUBLE_TAP_DISTANCE
    ) {
      lastTap.current = null;
      setAnimated(true);
      const current = transformRef.current;
      if (current.scale > 1) {
        applyTransform(IDENTITY);
      } else {
        // Zooms in around the tapped point
        const point = relative(event.clientX, event.clientY);
        applyTransform(clamped({ scale: DOUBLE_TAP_SCALE, x: -point.x * (DOUBLE_TAP_SCALE - 1), y: -point.y * (DOUBLE_TAP_SCALE - 1) }));
      }
    } else {
      lastTap.current = { time: now, x: event.clientX, y: event.clientY };
    }
  };

  const onPointerCancel = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    startGesture();
  };

  const onWheel = (event: React.WheelEvent) => {
    if (!loaded) return;
    const current = transformRef.current;
    const scale = current.scale * Math.exp(-event.deltaY / 300);
    const point = relative(event.clientX, event.clientY);
    const contentX = (point.x - current.x) / current.scale;
    const contentY = (point.y - current.y) / current.scale;
    setAnimated(false);
    applyTransform(clamped({ scale, x: point.x - contentX * scale, y: point.y - contentY * scale }));
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={modalRef}
      className="fixed inset-0 z-[200] flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
    >
      <div className="flex h-11 shrink-0 items-center justify-end px-4 pt-[env(safe-area-inset-top)] box-content">
        <button type="button" className="text-body font-semibold active:opacity-50" onClick={onClose}>
          Done
        </button>
      </div>
      <div
        ref={containerRef}
        className="relative flex flex-1 touch-none select-none items-center justify-center overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onWheel={onWheel}
      >
        {!loaded && !failed && <LoaderCircle className="absolute animate-spin text-white" size={28} aria-label="Loading" />}
        {failed && <p className="absolute px-6 text-center text-footnote text-white/70">The photo could not be loaded.</p>}
        {src && (
          // eslint-disable-next-line @next/next/no-img-element -- served by the backend through the /api proxy
          <img
            ref={imageRef}
            src={src}
            alt=""
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={`max-h-full max-w-full object-contain ${loaded ? "" : "opacity-0"} ${animated ? "transition-transform duration-300" : ""}`}
            style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
