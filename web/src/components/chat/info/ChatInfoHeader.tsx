"use client";

import { Camera } from "lucide-react";
import { useRef } from "react";

import { Spinner } from "@/components/ui/controls";
import { ChatImage } from "@/components/chat/images";
import type { ChatWithMembers, User } from "@/types/models";

/**
 * The header of ChatInfoView.swift: the large image with the name and what kind of chat it is below. The admins of a
 * group change its image with a tap on it.
 */
export function ChatInfoHeader({
  chat,
  users,
  currentUserId,
  title,
  subtitle,
  canChangeImage,
  isSaving,
  onPickImage,
}: {
  chat: ChatWithMembers;
  users: Map<number, User>;
  currentUserId: number | null;
  title: string;
  subtitle: string | null;
  canChangeImage: boolean;
  isSaving: boolean;
  onPickImage: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col items-center gap-2.5 py-1 text-center">
      {canChangeImage ? (
        <>
          <button
            type="button"
            aria-label="Change group image"
            disabled={isSaving}
            onClick={() => input.current?.click()}
            className="relative rounded-full transition-[scale,opacity] active:scale-95 active:opacity-80"
          >
            <ChatImage chat={chat} users={users} currentUserId={currentUserId} size={96} opensPhotoViewer={false} />
            {isSaving && (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/35">
                <Spinner className="text-white" />
              </span>
            )}
            <span
              className="absolute -bottom-0.5 -right-0.5 flex size-[30px] items-center justify-center rounded-full border-[3px] border-grouped bg-app text-app-foreground"
              aria-hidden
            >
              <Camera size={13} strokeWidth={2.5} />
            </span>
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Picking the same file again has to trigger a change too
              event.target.value = "";
              if (file) onPickImage(file);
            }}
          />
        </>
      ) : (
        <ChatImage chat={chat} users={users} currentUserId={currentUserId} size={96} />
      )}
      <div className="flex flex-col gap-0.5">
        <h2 className="break-words text-title2 font-bold">{title}</h2>
        {subtitle && <p className="text-subheadline text-secondary-label">{subtitle}</p>}
      </div>
    </div>
  );
}
