"use client";

import { useState, type ReactNode } from "react";

import { imageUrl } from "@/lib/api";

/**
 * Port of ServerImageView.swift: a stored image by the hash in its *_url field, or the placeholder while it loads, if
 * there is none or if it can't be loaded (e.g. offline and not cached). The browser caches the images (the server sends
 * them as immutable) and decodes them off the main thread (`decoding="async"`).
 *
 * - default: the image fills the box given by `className` (`fit` like `.fit` / `.fill`)
 * - `intrinsic`: the image keeps its own size, limited by `imageClassName` (e.g. a max width), and the placeholder
 *   decides the size until it's loaded, like the photos in the chat
 */
export function ServerImage({
  hash,
  alt = "",
  fit = "contain",
  className = "",
  imageClassName = "",
  intrinsic = false,
  placeholder,
  lazy = true,
}: {
  hash: string | null | undefined;
  alt?: string;
  fit?: "contain" | "cover";
  className?: string;
  imageClassName?: string;
  intrinsic?: boolean;
  placeholder: ReactNode;
  /** Loads the image only when it scrolls into view, e.g. in lists */
  lazy?: boolean;
}) {
  const src = imageUrl(hash);
  // The url that was loaded or failed, so a new hash shows the placeholder again
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  if (!src || failed === src) return <>{placeholder}</>;
  const isLoaded = loaded === src;

  const image = (layout: string) => (
    // eslint-disable-next-line @next/next/no-img-element -- served by the backend through the /api proxy
    <img
      key={src}
      src={src}
      alt={alt}
      loading={lazy ? "lazy" : "eager"}
      decoding="async"
      draggable={false}
      onLoad={() => setLoaded(src)}
      onError={() => setFailed(src)}
      className={`${layout} ${isLoaded ? "" : "opacity-0"}`}
    />
  );

  if (intrinsic) {
    return (
      <span className={`relative block w-fit ${className}`}>
        {!isLoaded && placeholder}
        {image(isLoaded ? `block ${imageClassName}` : "absolute inset-0 h-full w-full")}
      </span>
    );
  }

  return (
    <span className={`relative block overflow-hidden ${className}`}>
      {!isLoaded && <span className="absolute inset-0 flex">{placeholder}</span>}
      {image(`block h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"} ${imageClassName}`)}
    </span>
  );
}
