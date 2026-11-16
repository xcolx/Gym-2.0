"use client";

import { Check, Share } from "lucide-react";
import { useEffect, useState } from "react";

import { shareOrDownloadFile } from "./share";

/**
 * The share button with the square.and.arrow.up icon for an image, which is made when tapped: the share sheet of the
 * system, or a download where the browser can't share files (a check mark shows it for a moment)
 */
export function ShareImageButton({
  image,
  label = "Share",
  className = "",
}: {
  image: () => Promise<File>;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    if (!downloaded) return;
    const timer = setTimeout(() => setDownloaded(false), 1500);
    return () => clearTimeout(timer);
  }, [downloaded]);

  return (
    <button
      type="button"
      aria-label={downloaded ? "Downloaded" : label}
      aria-busy={busy}
      disabled={busy}
      className={`active:opacity-50 disabled:opacity-50 ${className}`}
      onClick={async () => {
        setBusy(true);
        try {
          if ((await shareOrDownloadFile(await image())) === "downloaded") setDownloaded(true);
        } catch {
          // The image could not be made, nothing is shared
        } finally {
          setBusy(false);
        }
      }}
    >
      {downloaded ? <Check size={22} strokeWidth={2.25} /> : <Share size={22} strokeWidth={2.25} />}
    </button>
  );
}
