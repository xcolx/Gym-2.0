"use client";

// Port of HighlightedBodyView.swift. If the image of a muscle can't be loaded (offline without cache, or a test
// database without real images), the image bundled in public/images/Highlighted Body is used, through the same mask.

import { useEffect, useState } from "react";

import { imageApi, isApiError } from "@/lib/api";
import { makeMuscleMask, maskSize } from "@/lib/domain/muscle-mask";
import type { Muscle } from "@/types/models";

const BODY_SRC = "/images/Highlighted%20Body";

/** The muscles with a bundled image, by name */
const BUNDLED_MUSCLES = new Set([
  "Abductors",
  "Abs",
  "Adductors",
  "Biceps",
  "Calves",
  "Chest",
  "Forearms",
  "Front Deltoid",
  "Glutes",
  "Hamstrings",
  "Lateral Deltoid",
  "Lats",
  "Lower Back",
  "Obliques",
  "Quads",
  "Rear Deltoid",
  "Sternocleidomastoid",
  "Trapezius",
  "Triceps",
]);

const bundledSrc = (name: string) => `${BODY_SRC}/Muscles/${encodeURIComponent(name)}.png`;

// The masks as object URLs, made once per page load (MuscleMaskCache): of the server's images by hash, of the bundled
// images by name, and the one shown for a muscle by hash and name
const serverMasks = new Map<string, Promise<{ mask: string | null; retry: boolean }>>();
const bundledMasks = new Map<string, Promise<string | null>>();
const resolvedMasks = new Map<string, string | null>();

const cacheKey = (muscle: Muscle) => `${muscle.imageUrl}|${muscle.name}`;

/** The colored part of an image as a white PNG with its opacity, null if it can't be decoded */
async function maskFromImage(image: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(image);
  const { width, height } = maskSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const pixels = context.getImageData(0, 0, width, height);
  makeMuscleMask(pixels.data);
  context.putImageData(pixels, 0, 0);
  const mask = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return mask ? URL.createObjectURL(mask) : null;
}

function bundledMask(muscle: Muscle): Promise<string | null> {
  if (!BUNDLED_MUSCLES.has(muscle.name)) return Promise.resolve(null);
  let promise = bundledMasks.get(muscle.name);
  if (!promise) {
    promise = fetch(bundledSrc(muscle.name))
      .then(async (response) => (response.ok ? maskFromImage(await response.blob()) : null))
      .catch(() => null);
    bundledMasks.set(muscle.name, promise);
  }
  return promise;
}

/** The mask of the server's image, loaded once per hash. `retry` if the network failed, so it's tried again later. */
function serverMask(hash: string): Promise<{ mask: string | null; retry: boolean }> {
  let promise = serverMasks.get(hash);
  if (!promise) {
    promise = imageApi
      .imageData(hash)
      .then(async (data) => ({ mask: await maskFromImage(data), retry: false }))
      .catch((error: unknown) => {
        // Offline or a server problem: the bundled image for now, the server's again next time
        const status = isApiError(error) ? (error.status ?? 0) : 0;
        const retry =
          isApiError(error) && (error.kind === "transport" || status === 408 || status === 429 || status >= 500);
        if (retry) serverMasks.delete(hash);
        return { mask: null, retry };
      });
    serverMasks.set(hash, promise);
  }
  return promise;
}

/** The mask of the muscle: from the server, or the bundled image if the server has none */
async function loadMask(muscle: Muscle): Promise<string | null> {
  const fromServer = muscle.imageUrl ? await serverMask(muscle.imageUrl) : { mask: null, retry: false };
  const mask = fromServer.mask ?? (await bundledMask(muscle));
  if (!fromServer.retry) resolvedMasks.set(cacheKey(muscle), mask);
  return mask;
}

/** The colored part of the image of a muscle, invisible while it loads (MuscleHighlightView) */
function MuscleHighlight({ muscle, color }: { muscle: Muscle; color: string }) {
  const key = cacheKey(muscle);
  const [loaded, setLoaded] = useState<{ key: string; mask: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMask(muscle).then((mask) => {
      if (!cancelled) setLoaded({ key, mask });
    });
    return () => {
      cancelled = true;
    };
    // The key contains everything of the muscle that is used
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // The cache is checked directly, so a muscle that was shown before appears right away
  const mask = loaded?.key === key ? loaded.mask : (resolvedMasks.get(key) ?? null);
  if (!mask) return null;
  const image = `url("${mask}")`;
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundColor: color,
        maskImage: image,
        WebkitMaskImage: image,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}

export function HighlightedBody({
  primaryMuscles,
  secondaryMuscles,
  className = "",
}: {
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  className?: string;
}) {
  const layer = "pointer-events-none absolute inset-0 h-full w-full object-contain";
  return (
    <div className={`relative aspect-[1051/1261] ${className}`}>
      {secondaryMuscles.map((muscle) => (
        <MuscleHighlight key={`s-${muscle.serverId}`} muscle={muscle} color="var(--secondary-muscle)" />
      ))}
      {primaryMuscles.map((muscle) => (
        <MuscleHighlight key={`p-${muscle.serverId}`} muscle={muscle} color="#ff0000" />
      ))}
      {/* eslint-disable @next/next/no-img-element */}
      <img
        src={`${BODY_SRC}/highlighted_body_black.png`}
        alt="Body with trained muscles highlighted"
        className={`${layer} dark:hidden`}
      />
      <img src={`${BODY_SRC}/highlighted_body_white.png`} alt="" className={`${layer} hidden dark:block`} />
      {/* eslint-enable @next/next/no-img-element */}
    </div>
  );
}
