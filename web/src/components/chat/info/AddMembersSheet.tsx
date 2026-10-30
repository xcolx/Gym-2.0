"use client";

import { Users } from "lucide-react";

import { FormSection, FormStack } from "@/components/ui/Form";
import { ContentUnavailable } from "@/components/chat/chat-controls";
import { SelectableFriendRow } from "@/components/chat/NewGroupSheet";
import { MessageAlert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/controls";
import { Sheet, SheetButton } from "@/components/ui/overlay";
import type { ChatWithMembers } from "@/types/models";

import { useAddMembers } from "./use-chat-info";

/** AddMembersView of ChatInfoView.swift: adds friends that aren't members yet to a private group */
export function AddMembersSheet({ chat, onClose }: { chat: ChatWithMembers; onClose: () => void }) {
  const { isLoaded, candidates, selectedIds, toggle, isAdding, add, error, clearError } = useAddMembers(chat, onClose);

  return (
    <Sheet
      open
      onClose={onClose}
      title="Add Members"
      grouped
      leading={<SheetButton onClick={onClose}>Cancel</SheetButton>}
      trailing={
        isAdding ? (
          <Spinner />
        ) : (
          <SheetButton bold disabled={selectedIds.size === 0} onClick={() => void add()}>
            Add
          </SheetButton>
        )
      }
    >
      {isLoaded && candidates.length === 0 ? (
        <ContentUnavailable icon={Users} title="No Friends to Add" description="All your friends are already in the group." className="h-full" />
      ) : (
        <FormStack>
          <FormSection>
            {candidates.map((friend) => (
              <SelectableFriendRow
                key={friend.serverId}
                friend={friend}
                selected={selectedIds.has(friend.serverId)}
                onToggle={() => toggle(friend.serverId)}
              />
            ))}
          </FormSection>
        </FormStack>
      )}
      <MessageAlert title="Could not add the members" message={error} onClose={clearError} />
    </Sheet>
  );
}
