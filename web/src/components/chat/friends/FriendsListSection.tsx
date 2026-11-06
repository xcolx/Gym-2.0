"use client";

import { MessageCircle, Users } from "lucide-react";

import { FormRow, FormSection } from "@/components/ui/Form";
import { Spinner } from "@/components/ui/controls";
import { ProfileIcon } from "@/components/ui/ProfileIcon";
import type { User } from "@/types/models";

import type { OpenContextMenu } from "./use-context-menu";

/** friendsSection of FriendsView: a tap opens the direct chat, the context menu has the friend actions */
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
  if (friends === undefined) return null;
  return (
    <FormSection header={friends.length === 0 ? undefined : friends.length === 1 ? "1 friend" : `${friends.length} friends`}>
      {friends.length === 0 && (
        <div className="flex flex-col items-center gap-2 px-4 py-5 text-center">
          <Users size={34} className="text-app" aria-hidden />
          <h2 className="text-headline font-semibold">No friends yet</h2>
          <p className="text-subheadline text-secondary-label">Search for a username to add someone.</p>
        </div>
      )}
      {friends.map((friend) => (
        <FormRow
          key={friend.serverId}
          rowClassName="relative select-none [-webkit-touch-callout:none] hover:bg-field/15 active:bg-field/40"
          onContextMenu={openContextMenu(friend.username, [
            { label: "Message", onSelect: () => onMessage(friend) },
            { label: "Remove friend", destructive: true, onSelect: () => onRemove(friend) },
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
          <ProfileIcon hash={friend.profileIconUrl} size={44} color={friend.schemeColor} imageHash={friend.profileImageUrl} />
          <span className="pointer-events-none min-w-0 flex-1 truncate font-medium">{friend.username}</span>
          {busyIds.has(friend.serverId) ? (
            <Spinner />
          ) : (
            <span className="pointer-events-none flex size-[34px] items-center justify-center rounded-full bg-app/15 text-app" aria-hidden>
              <MessageCircle size={16} className="fill-current" />
            </span>
          )}
        </FormRow>
      ))}
    </FormSection>
  );
}
