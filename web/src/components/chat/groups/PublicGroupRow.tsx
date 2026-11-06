"use client";

import { Spinner } from "@/components/ui/controls";
import { GroupImage } from "@/components/chat/images";
import type { ChatDTO } from "@/lib/api";
import { memberCountText } from "@/lib/domain/chat-feature";

/** A row of PublicGroupsView: image, name and member count, "Join" or "Joined". A tap opens or joins the group. */
export function PublicGroupRow({
  group,
  joined,
  isJoining,
  disabled,
  onOpen,
  onOpenMenu,
}: {
  group: ChatDTO;
  joined: boolean;
  isJoining: boolean;
  /** While any group is joined */
  disabled: boolean;
  onOpen: () => void;
  onOpenMenu: () => void;
}) {
  return (
    <li
      className="group/row relative flex select-none items-center gap-3 px-4 py-2.5 [-webkit-touch-callout:none] hover:bg-field/15 active:bg-field/40"
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenMenu();
      }}
    >
      <button
        type="button"
        className="absolute inset-0 disabled:cursor-default"
        aria-label={group.name ?? "Group"}
        disabled={disabled}
        onClick={onOpen}
      />
      <GroupImage hash={group.imageUrl} name={group.name} size={44} />
      <div className="pointer-events-none min-w-0 flex-1">
        <p className="truncate font-medium">{group.name ?? "Group"}</p>
        <p className="text-caption1 text-secondary-label">{memberCountText(group.members.length)}</p>
      </div>
      <span className="pointer-events-none shrink-0">
        {isJoining ? (
          <Spinner />
        ) : joined ? (
          <span className="text-subheadline text-secondary-label">Joined</span>
        ) : (
          <span className="rounded-full bg-app px-3.5 py-1.5 text-subheadline font-semibold text-app-foreground">Join</span>
        )}
      </span>
      <span className="absolute bottom-0 left-[72px] right-0 h-px bg-separator group-last/row:hidden" aria-hidden />
    </li>
  );
}
