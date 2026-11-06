"use client";

import { Camera, UsersRound } from "lucide-react";
import { useRef, type ChangeEvent } from "react";

import { OpensPhotoViewer } from "@/components/ui/PhotoViewer";
import { ProfileIcon } from "@/components/ui/ProfileIcon";
import { ServerImage } from "@/components/ui/ServerImage";
import { otherMemberId } from "@/lib/domain/chat";
import { groupInitials } from "@/lib/domain/chat-feature";
import type { ChatWithMembers, User } from "@/types/models";

/** A group without image: the initials of its name in the app color, or `person.3.fill` without any */
function GroupPlaceholder({ name, size }: { name: string | null; size: number }) {
  const initials = groupInitials(name);
  return (
    <span className="flex h-full w-full items-center justify-center rounded-full bg-app/18 text-app" aria-hidden>
      {initials ? (
        <span className="font-rounded font-semibold leading-none" style={{ fontSize: size * 0.38 }}>
          {initials}
        </span>
      ) : (
        <UsersRound size={size * 0.56} fill="currentColor" strokeWidth={1.5} />
      )}
    </span>
  );
}

/** ChatImageView of ChatsView.swift: the group image, or the profile icon of the other member of a direct chat */
export function ChatImage({
  chat,
  users,
  currentUserId,
  size,
  opensPhotoViewer = true,
}: {
  chat: ChatWithMembers;
  users: ReadonlyMap<number, User>;
  currentUserId: number | null;
  size: number;
  /** Whether a tap opens the image in the photo viewer */
  opensPhotoViewer?: boolean;
}) {
  if (chat.groupChat) {
    return <GroupImage hash={chat.imageUrl} name={chat.name} size={size} opensPhotoViewer={opensPhotoViewer} />;
  }
  const otherId = otherMemberId(chat, currentUserId);
  const other = otherId === null ? undefined : users.get(otherId);
  return (
    <ProfileIcon
      hash={other?.profileIconUrl}
      size={size}
      color={other?.schemeColor}
      imageHash={opensPhotoViewer ? other?.profileImageUrl : null}
    />
  );
}

/** The round image of a group, or the initials of its name without one. A tap opens the image in the photo viewer. */
export function GroupImage({
  hash,
  name,
  size,
  opensPhotoViewer = true,
}: {
  hash: string | null;
  name: string | null;
  size: number;
  opensPhotoViewer?: boolean;
}) {
  const image = (
    <span className="block shrink-0" style={{ width: size, height: size }}>
      <ServerImage hash={hash} fit="cover" className="h-full w-full rounded-full" placeholder={<GroupPlaceholder name={name} size={size} />} />
    </span>
  );
  if (!opensPhotoViewer) return image;
  return (
    <OpensPhotoViewer hash={hash} label="Group image">
      {image}
    </OpensPhotoViewer>
  );
}

/**
 * GroupImagePicker of NewGroupChatView.swift: the group image as a circle that opens the photo picker. Shows a newly
 * picked image (`previewUrl`) instead of the stored one. A read-only picker only shows the image, e.g. to members that
 * aren't admins.
 */
export function GroupImagePicker({
  previewUrl,
  hash,
  disabled = false,
  readOnly = false,
  onPick,
}: {
  previewUrl: string | null;
  hash: string | null;
  disabled?: boolean;
  readOnly?: boolean;
  onPick: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const placeholder = (
    <span className="flex h-full w-full items-center justify-center rounded-full bg-[#8e8e93]">
      <Camera size={22} fill="white" strokeWidth={1.5} className="text-[#8e8e93]" aria-hidden />
    </span>
  );
  return (
    <>
      <button
        type="button"
        aria-label="Group image"
        disabled={disabled || readOnly}
        className={`block h-14 w-14 shrink-0 overflow-hidden rounded-full ${readOnly ? "" : "active:opacity-70 disabled:opacity-60"}`}
        onClick={() => input.current?.click()}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL of the picked file
          <img src={previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <ServerImage hash={hash} fit="cover" className="h-full w-full" placeholder={placeholder} />
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0];
          // Picking the same file again has to trigger a change too
          event.target.value = "";
          if (file) onPick(file);
        }}
      />
    </>
  );
}
