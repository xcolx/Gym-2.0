"use client";

import { MessageCircle } from "lucide-react";

import { FormRow, FormSection } from "@/components/ui/Form";
import { Spinner } from "@/components/ui/controls";
import { ProfileIcon } from "@/components/ui/ProfileIcon";
import type { User } from "@/types/models";

import type { OpenContextMenu } from "./use-context-menu";

/** The friends of FriendsView: a tap opens the direct chat, the context menu has the friend actions */
export function FriendsListSection({
  friends,
  busyIds,
  onMessage,
  onRemove,
  onReport,
  onBlock,
  openContextMenu,
}: {
  /** Undefined while loading */
  friends: User[] | undefined;
  busyIds: ReadonlySet<number>;
  onMessage: (friend: User) => void;
  onRemove: (friend: User) => void;
  onReport: (friend: User) => void;
  onBlock: (friend: User) => void;
  openContextMenu: OpenContextMenu;
}) {
  return (
    <FormSection header="Friends">
      {friends !== undefined && friends.length === 0 && (
        <FormRow className="text-secondary-label">No friends yet. Search for their username above.</FormRow>
      )}
      {(friends ?? []).map((friend) => (
        <FormRow
          key={friend.serverId}
          rowClassName="relative select-none [-webkit-touch-callout:none] active:bg-field/40"
          onContextMenu={openContextMenu(friend.username, [
            { label: "Message", onSelect: () => onMessage(friend) },
            { label: "Remove Friend", destructive: true, onSelect: () => onRemove(friend) },
            { label: "Report…", onSelect: () => onReport(friend) },
            { label: "Block", destructive: true, onSelect: () => onBlock(friend) },
          ])}
        >
          <button
            type="button"
            className="absolute inset-0"
            aria-label={`Message ${friend.username}`}
            onClick={() => onMessage(friend)}
          />
          <ProfileIcon hash={friend.profileIconUrl} size={40} color={friend.schemeColor} imageHash={friend.profileImageUrl} />
          <span className="pointer-events-none min-w-0 flex-1 truncate">{friend.username}</span>
          {busyIds.has(friend.serverId) ? (
            <Spinner />
          ) : (
            <MessageCircle size={20} className="pointer-events-none text-app" aria-hidden />
          )}
        </FormRow>
      ))}
    </FormSection>
  );
}
