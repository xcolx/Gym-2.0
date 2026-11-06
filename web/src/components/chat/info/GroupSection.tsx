"use client";

import { Globe, ImageMinus } from "lucide-react";

import { ButtonRow, FormRow, FormSection, SettingsLabel } from "@/components/ui/Form";
import { PLAIN_BUTTON } from "@/components/chat/chat-controls";
import { Spinner, Switch } from "@/components/ui/controls";
import { groupFooter } from "@/lib/domain/chat-feature";
import type { ChatWithMembers } from "@/types/models";

import type { useGroupSection } from "./use-group-section";

/** groupSection of ChatInfoView: the name, the visibility and the image of a group, only for its admins */
export function GroupSection({ chat, group }: { chat: ChatWithMembers; group: ReturnType<typeof useGroupSection> }) {
  return (
    <FormSection header="Group" footer={groupFooter(chat.isPublic)}>
      <FormRow rowClassName="focus-ring-within rounded-[20px]" className="py-0">
        <form
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3"
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
            enterKeyHint="done"
            className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-tab-inactive"
          />
          {group.isSaving ? (
            <Spinner />
          ) : (
            group.changed && (
              <button type="submit" className={`${PLAIN_BUTTON} font-semibold`} disabled={!group.isValidName}>
                Save
              </button>
            )
          )}
        </form>
      </FormRow>
      <FormRow>
        <span className="flex-1">
          <SettingsLabel icon={Globe} title="Public" />
        </span>
        {group.isChangingPublic && <Spinner />}
        <Switch
          label="Public"
          checked={chat.isPublic}
          disabled={group.isChangingPublic}
          onChange={(value) => void group.setPublic(value)}
        />
      </FormRow>
      {chat.imageUrl && (
        <ButtonRow destructive disabled={group.isSaving} onClick={() => void group.removeImage()}>
          <ImageMinus size={20} className="w-6" aria-hidden />
          Remove group image
        </ButtonRow>
      )}
    </FormSection>
  );
}
