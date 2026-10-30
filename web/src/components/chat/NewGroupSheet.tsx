"use client";

import { Circle, CircleCheck } from "lucide-react";
import { useEffect, useState } from "react";

import type { ImageUpload } from "@/lib/api";
import type { User } from "@/types/models";
import { errorMessage } from "@/lib/api";
import { isValidGroupName } from "@/lib/domain/chat-feature";
import { createGroupChat } from "@/lib/chat/actions";
import { useFriends } from "@/lib/repo";
import { MessageAlert } from "@/components/ui/Alert";
import { Spinner, Switch } from "@/components/ui/controls";
import { afterOverlayClose, Sheet, SheetButton } from "@/components/ui/overlay";
import { FormRow, FormSection, FormStack, PressableRow } from "@/components/ui/Form";
import { groupImageUpload } from "./image-upload";
import { ProfileIcon } from "@/components/ui/ProfileIcon";
import { GroupImagePicker } from "./images";

/** Port of NewGroupChatView.swift */
export function NewGroupSheet({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  /** Called with the server id of the stored chat after it was created */
  onCreate: (chatId: number) => void;
}) {
  // Mounted while open, so it starts empty every time
  return open ? <NewGroupForm onClose={onClose} onCreate={onCreate} /> : null;
}

function NewGroupForm({ onClose, onCreate }: { onClose: () => void; onCreate: (chatId: number) => void }) {
  const friends = useFriends();
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [image, setImage] = useState<{ upload: ImageUpload; url: string } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (image) URL.revokeObjectURL(image.url);
  }, [image]);

  const canCreate = isValidGroupName(name) && (isPublic || selectedIds.size > 0) && !isCreating;

  const pick = async (file: File) => {
    const upload = await groupImageUpload(file);
    if (!upload) {
      setError("The image could not be loaded.");
      return;
    }
    setImage({ upload, url: URL.createObjectURL(upload.data) });
  };

  const toggle = (id: number) =>
    setSelectedIds((ids) => {
      const next = new Set(ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const create = async () => {
    if (!canCreate) return;
    setIsCreating(true);
    try {
      const chatId = await createGroupChat(
        name.trim(),
        (friends ?? []).map((friend) => friend.serverId).filter((id) => selectedIds.has(id)),
        isPublic,
        image?.upload ?? null,
      );
      onClose();
      // After the sheet removed its history entry, which would undo the navigation otherwise
      afterOverlayClose(() => onCreate(chatId));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="New Group"
      grouped
      leading={<SheetButton onClick={onClose}>Cancel</SheetButton>}
      trailing={
        isCreating ? (
          <Spinner />
        ) : (
          <SheetButton bold disabled={!canCreate} onClick={create}>
            Create
          </SheetButton>
        )
      }
    >
      <FormStack>
        <FormSection
          footer={
            isPublic
              ? "Everyone can find and join a public group, so it can be created without members."
              : "Only the members you add can see the group. Add at least one friend."
          }
        >
          <FormRow className="gap-4" rowClassName="focus-ring-within rounded-[10px]">
            <GroupImagePicker previewUrl={image?.url ?? null} hash={null} onPick={pick} />
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Group name"
              aria-label="Group name"
              className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-tab-inactive"
            />
          </FormRow>
          <FormRow className="justify-between">
            <span>Public</span>
            <Switch label="Public" checked={isPublic} onChange={setIsPublic} />
          </FormRow>
        </FormSection>

        <FormSection header="Members">
          {friends !== undefined && friends.length === 0 && (
            <FormRow className="text-secondary-label">Add friends first to create a group with them.</FormRow>
          )}
          {(friends ?? []).map((friend) => (
            <SelectableFriendRow
              key={friend.serverId}
              friend={friend}
              selected={selectedIds.has(friend.serverId)}
              onToggle={() => toggle(friend.serverId)}
            />
          ))}
        </FormSection>
      </FormStack>

      <MessageAlert title="Could not create the group" message={error} onClose={() => setError(null)} />
    </Sheet>
  );
}

/** A friend to pick for a group, with a check mark while selected (NewGroupChatView and AddMembersView) */
export function SelectableFriendRow({ friend, selected, onToggle }: { friend: User; selected: boolean; onToggle: () => void }) {
  return (
    <PressableRow onClick={onToggle} aria-pressed={selected}>
      <ProfileIcon hash={friend.profileIconUrl} size={36} color={friend.schemeColor} />
      <span className="flex-1 truncate">{friend.username}</span>
      {selected ? (
        <CircleCheck size={22} className="text-app" aria-label="Selected" />
      ) : (
        <Circle size={22} className="text-app" aria-label="Not selected" />
      )}
    </PressableRow>
  );
}
