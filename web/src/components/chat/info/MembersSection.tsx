"use client";

import { Ellipsis, UserPlus } from "lucide-react";

import { FormRow, FormSection, PressableRow } from "@/components/ui/Form";
import { Menu, type MenuItem } from "@/components/chat/chat-controls";
import { Spinner } from "@/components/ui/controls";
import { ProfileIcon } from "@/components/ui/ProfileIcon";
import { isMemberAdmin, memberCountText, memberDetails } from "@/lib/domain/chat-feature";
import type { ChatMember, ChatWithMembers, User } from "@/types/models";

/** The members of a group with the menu of the actions for each, and "Add members" for the admins of a private group */
export function MembersSection({
  chat,
  members,
  users,
  currentUserId,
  busyIds,
  footer,
  canAddMembers,
  onAddMembers,
  memberActions,
}: {
  chat: ChatWithMembers;
  members: ChatMember[];
  users: Map<number, User>;
  currentUserId: number | null;
  busyIds: ReadonlySet<number>;
  footer: string | null;
  canAddMembers: boolean;
  onAddMembers: () => void;
  memberActions: (member: ChatMember, user: User | undefined, username: string) => MenuItem[];
}) {
  return (
    <FormSection header={memberCountText(chat.members.length)} footer={footer}>
      {canAddMembers && (
        <PressableRow onClick={onAddMembers} className="text-app">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-app/15" aria-hidden>
            <UserPlus size={19} strokeWidth={2.25} />
          </span>
          Add members
        </PressableRow>
      )}
      {members.map((member) => {
        const { userId } = member;
        const user = users.get(userId);
        const username = user?.username ?? "Unknown user";
        const details = memberDetails(userId, user, currentUserId);
        const actions = memberActions(member, user, username);
        return (
          <FormRow key={userId}>
            <ProfileIcon hash={user?.profileIconUrl} size={40} color={user?.schemeColor} imageHash={user?.profileImageUrl} />
            <div className="flex min-w-0 flex-1 flex-col gap-px">
              <p className="truncate">{username}</p>
              {details && <p className="text-caption1 text-secondary-label">{details}</p>}
            </div>
            {isMemberAdmin(chat, member) && (
              <span className="shrink-0 rounded-full bg-app/15 px-2 py-[3px] text-[11px] font-semibold leading-[13px] text-app">
                Admin
              </span>
            )}
            {busyIds.has(userId) ? (
              <span className="flex w-7 justify-center">
                <Spinner />
              </span>
            ) : (
              actions.length > 0 && (
                <Menu label={`Actions for ${username}`} items={actions}>
                  <span className="flex size-7 items-center justify-center rounded-full bg-app/15 text-app">
                    <Ellipsis size={18} strokeWidth={2.5} aria-hidden />
                  </span>
                </Menu>
              )
            )}
          </FormRow>
        );
      })}
    </FormSection>
  );
}
