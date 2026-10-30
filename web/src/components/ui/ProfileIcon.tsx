"use client";

import { UserRound } from "lucide-react";
import type { ReactNode } from "react";

import { OpensPhotoViewer } from "@/components/ui/PhotoViewer";
import { ServerImage } from "@/components/ui/ServerImage";
import { DEFAULT_SCHEME_COLOR, isHexColor } from "@/lib/repo/user";

/** `person.crop.circle.fill` in gray, the placeholder of a profile icon */
function PersonPlaceholder({ size }: { size: number }) {
  return (
    <span className="flex h-full w-full items-end justify-center overflow-hidden rounded-full bg-[#aeaeb2] dark:bg-[#636366]">
      <UserRound size={size * 0.8} strokeWidth={0} fill="white" className="-mb-[8%] text-white" aria-hidden />
    </span>
  );
}

/**
 * Port of ProfileIconView.swift. `overlay` is shown on top, e.g. a spinner while a new image is uploaded.
 */
export function ProfileIcon({
  hash,
  size,
  color,
  imageHash,
  label = "Profile image",
  overlay,
}: {
  hash: string | null | undefined;
  size: number;
  /** The app color of the user as hex code, the default color if null */
  color: string | null | undefined;
  imageHash?: string | null;
  label?: string;
  overlay?: ReactNode;
}) {
  return (
    <OpensPhotoViewer hash={imageHash || null} label={label}>
      <ProfileCircle size={size} color={color} overlay={overlay}>
        <ServerImage hash={hash || null} fit="cover" className="h-full w-full" placeholder={<PersonPlaceholder size={size} />} />
      </ProfileCircle>
    </OpensPhotoViewer>
  );
}

/** `.clipShape(Circle()).profileBorder(color:size:)`: the content in a circle with the border in the user's color */
export function ProfileCircle({
  size,
  color,
  overlay,
  children,
  className = "",
}: {
  size: number;
  color: string | null | undefined;
  overlay?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const border = isHexColor(color) ? color : DEFAULT_SCHEME_COLOR;
  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-full ${className}`} style={{ width: size, height: size }}>
      {children}
      <span
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ boxShadow: `inset 0 0 0 ${Math.max(2, size / 24)}px ${border}` }}
      />
      {overlay && <span className="absolute inset-0 flex items-center justify-center bg-black/30">{overlay}</span>}
    </span>
  );
}
