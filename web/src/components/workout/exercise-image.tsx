"use client";

// The images of an exercise (ExerciseImagesView.swift) and the preparation of a picked photo

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { X } from "lucide-react";

import { detectImageUpload, imageUrl } from "@/lib/api";
import { EXERCISE_LIMITS } from "@/lib/domain/exercise";

/**
 * The server takes images up to 20 MiB (IMAGE_MAX_UPLOAD_BYTES) as JPEG, PNG, WebP or HEIC, but the reverse proxy
 * refuses whole requests over 20 MiB. All images of an exercise are sent in one request together with its other
 * fields, so every image gets an equal share.
 */
const MAX_UPLOAD_BYTES = Math.floor((20 * 1024 * 1024 - 256 * 1024) / EXERCISE_LIMITS.images);
/** The server stores exercise images with at most 1280 px per side (EXERCISE_IMAGE_MAX_DIMENSION) */
const MAX_SIDE = 1280;

/**
 * The picked file as it is uploaded: unchanged if the server accepts it, otherwise (another format like GIF, or too
 * large) converted to a JPEG of at most 1280 px per side.
 */
export async function prepareExerciseImage(file: Blob): Promise<Blob> {
  if (file.size <= MAX_UPLOAD_BYTES && (await detectImageUpload(file))) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The image can't be converted."))), "image/jpeg", 0.9),
  );
}

/**
 * The pending image if there is one, otherwise the image of the server, the placeholder while none can be shown.
 * The object URL of a pending image is set on the element directly, so it is revoked exactly when it isn't shown.
 */
function ExerciseImage({
  pendingImage,
  hash,
  placeholder,
}: {
  pendingImage: Blob | null | undefined;
  hash: string | null | undefined;
  placeholder: ReactNode;
}) {
  const image = useRef<HTMLImageElement>(null);
  const src = pendingImage ? null : imageUrl(hash);
  // what failed to load, e.g. offline or a HEIC the browser can't show
  const [failed, setFailed] = useState<Blob | string | null>(null);
  const source = pendingImage ?? src;
  const showsImage = !!source && failed !== source;

  useEffect(() => {
    const element = image.current;
    if (!pendingImage || !element) return;
    const url = URL.createObjectURL(pendingImage);
    element.src = url;
    return () => URL.revokeObjectURL(url);
  }, [pendingImage, showsImage]);

  if (!showsImage) return <div className="flex h-full w-full items-center justify-center">{placeholder}</div>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={image} src={src ?? undefined} alt="" className="h-full w-full object-contain" onError={() => setFailed(source)} />
  );
}

/** One image of `ExerciseImages`: an uploaded one (hash) or a pending one */
type ExerciseImageItem = { key: string; hash: string; pendingImage?: undefined } | { key: string; pendingImage: Blob; hash?: undefined };

const pendingImageKeys = new WeakMap<Blob, string>();
let nextPendingImageKey = 0;

/** The uploaded images followed by the pending ones, the order in which they are shown and stored on the server */
export function exerciseImageItems(imageUrls: readonly string[], pendingImages: readonly Blob[]): ExerciseImageItem[] {
  return [
    ...imageUrls.map((hash) => ({ key: hash, hash })),
    ...pendingImages.map((pendingImage) => {
      let key = pendingImageKeys.get(pendingImage);
      if (!key) {
        key = `pending-${nextPendingImageKey++}`;
        pendingImageKeys.set(pendingImage, key);
      }
      return { key, pendingImage };
    }),
  ];
}

/** How far a horizontal swipe has to go to switch the page, in CSS pixels */
const SWIPE_DISTANCE = 30;

/**
 * The images of an exercise as pages that are swiped horizontally, e.g. one per keyframe of the movement, with a dot
 * per page at the bottom while there is more than one. A swipe switches to the next page instantly, without scrolling,
 * so that swiping through the keyframes plays the movement like a flip book. The pages loop: after the last one comes
 * the first again. `trailing` is an additional last page (e.g. the button that adds an image), `onRemove` adds a
 * button to every image that removes it. Without pages the placeholder is shown.
 *
 * All pages are stacked and only the shown one is visible, so the images are loaded before they are swiped to.
 */
export function ExerciseImages({
  images,
  placeholder,
  trailing,
  onRemove,
}: {
  images: readonly ExerciseImageItem[];
  placeholder: ReactNode;
  trailing?: { label: string; content: ReactNode };
  onRemove?: (index: number) => void;
}) {
  const swipeStart = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  // a swipe that started on a button (e.g. the one that removes an image) doesn't click it
  const swiped = useRef(false);
  const [page, setPage] = useState(0);
  const pageCount = images.length + (trailing ? 1 : 0);
  const shownPage = Math.min(page, pageCount - 1);
  const loops = pageCount > 1;

  // Keeps the shown page when pages are added or removed, added images are shown right away instead of the page
  // that adds them staying in place
  const previousCount = useRef(images.length);
  useLayoutEffect(() => {
    const added = images.length > previousCount.current;
    const target = added ? previousCount.current : Math.max(0, Math.min(page, pageCount - 1));
    previousCount.current = images.length;
    setPage(target);
    // only when the pages change, not with every shown page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length, pageCount]);

  if (pageCount === 0) return <div className="flex h-full w-full items-center justify-center">{placeholder}</div>;

  // the page, wrapping around at both ends
  const show = (index: number) => setPage(((index % pageCount) + pageCount) % pageCount);

  const onPointerUp = (event: PointerEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!loops || !start || start.pointerId !== event.pointerId) return;
    const width = event.clientX - start.x;
    swiped.current = Math.abs(width) >= SWIPE_DISTANCE && Math.abs(width) > Math.abs(event.clientY - start.y);
    if (!swiped.current) return;
    show(shownPage + (width < 0 ? 1 : -1));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!loops) return;
    if (event.key === "ArrowRight") show(shownPage + 1);
    else if (event.key === "ArrowLeft") show(shownPage - 1);
    else return;
    event.preventDefault();
  };

  const renderPage = (index: number) => {
    const shown = index === shownPage;
    const pageClass = `absolute inset-0 ${shown ? "" : "invisible"}`;
    if (index === images.length) {
      return (
        <div key="trailing" className={pageClass} aria-hidden={!shown} inert={!shown}>
          {trailing?.content}
        </div>
      );
    }
    const image = images[index];
    return (
      <div
        key={image.key}
        className={pageClass}
        aria-label={`Image ${index + 1} of ${images.length}`}
        aria-hidden={!shown}
        inert={!shown}
      >
        <ExerciseImage pendingImage={image.pendingImage} hash={image.hash} placeholder={placeholder} />
        {onRemove && (
          <button
            type="button"
            aria-label={`Remove image ${index + 1}`}
            onClick={() => onRemove(index)}
            className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white active:opacity-50"
          >
            <X size={18} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="relative h-full w-full">
      <div
        // pan-y: the page still scrolls vertically, horizontal swipes come here
        className="relative h-full w-full touch-pan-y select-none overflow-hidden"
        onPointerDown={(event) => {
          swiped.current = false;
          if (event.isPrimary) swipeStart.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
        }}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipeStart.current = null)}
        onClickCapture={(event) => {
          if (swiped.current) event.stopPropagation();
          swiped.current = false;
        }}
        onDragStart={(event) => event.preventDefault()}
        onKeyDown={onKeyDown}
        tabIndex={loops ? 0 : undefined}
        aria-roledescription={loops ? "carousel" : undefined}
      >
        {Array.from({ length: pageCount }, (_, index) => renderPage(index))}
      </div>
      {loops && (
        <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center" role="tablist" aria-label="Images">
          {Array.from({ length: pageCount }, (_, index) => (
            <button
              key={index}
              type="button"
              role="tab"
              aria-selected={index === shownPage}
              aria-label={index < images.length ? `Image ${index + 1}` : trailing?.label}
              onClick={() => show(index)}
              className="pointer-events-auto flex h-5 w-3.5 items-center justify-center"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_2px_rgba(0,0,0,0.8)] ${index === shownPage ? "" : "opacity-40"}`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
