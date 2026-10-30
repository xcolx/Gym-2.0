"use client";

import { ButtonRow, FormRow, FormSection } from "@/components/ui/Form";
import { PLAIN_BUTTON } from "@/components/chat/chat-controls";
import { Spinner, Switch } from "@/components/ui/controls";
import { GroupImagePicker } from "@/components/chat/images";
import { groupFooter } from "@/lib/domain/chat-feature";
import type { ChatWithMembers } from "@/types/models";

import { useGroupSection } from "./use-group-section";

/** The name, image and public switch of a group (groupSection of ChatInfoView), only editable by its admins */
export function GroupSection({ chat, isAdmin, onError }: { chat: ChatWithMembers; isAdmin: boolean; onError: (message: string) => void }) {
  const group = useGroupSection(chat, onError);

  return (
    <FormSection footer={groupFooter(chat.isPublic)}>
      <FormRow className="gap-4" rowClassName="focus-ring-within rounded-[10px]">
        <GroupImagePicker
          previewUrl={null}
          hash={chat.imageUrl}
          disabled={group.isSaving}
          readOnly={!isAdmin}
          onPick={(file) => void group.pick(file)}
        />
        <form
          className="flex min-w-0 flex-1 items-center gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            group.saveName();
          }}
        >
          <input
            value={group.shownName}
            onChange={(event) => group.setName(event.target.value)}
            placeholder="Group name"
            aria-label="Group name"
            readOnly={!isAdmin}
            enterKeyHint="done"
            className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-tab-inactive"
          />
          {group.isSaving ? (
            <Spinner />
          ) : (
            group.changed && (
              <button type="submit" className={PLAIN_BUTTON} disabled={!group.isValidName}>
                Save
              </button>
            )
          )}
        </form>
      </FormRow>
      {isAdmin && chat.imageUrl && (
        <ButtonRow destructive disabled={group.isSaving} onClick={() => void group.removeImage()}>
          Remove Group Image
        </ButtonRow>
      )}
      {isAdmin && (
        <FormRow className="justify-between">
          <span className="flex-1">Public</span>
          {group.isChangingPublic && <Spinner />}
          <Switch
            label="Public"
            checked={chat.isPublic}
            disabled={group.isChangingPublic}
            onChange={(value) => void group.setPublic(value)}
          />
        </FormRow>
      )}
    </FormSection>
  );
}
