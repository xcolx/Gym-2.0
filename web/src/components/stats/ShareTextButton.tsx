"use client";

import { Check, Share } from "lucide-react";
import { useEffect, useState } from "react";

import { shareText } from "./share";

/**
 * ShareLink(item: text) with the square.and.arrow.up icon: the share sheet of the system, or the text is copied to
 * the clipboard (a check mark shows it for a moment). The text is built when tapped.
 */
export function ShareTextButton({
  text,
  label = "Share",
  className = "",
}: {
  text: () => string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      className={`active:opacity-50 ${className}`}
      onClick={async () => {
        if ((await shareText(text())) === "copied") setCopied(true);
      }}
    >
      {copied ? <Check size={22} strokeWidth={2.25} /> : <Share size={22} strokeWidth={2.25} />}
    </button>
  );
}
